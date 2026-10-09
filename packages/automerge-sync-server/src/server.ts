import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  maximumEmbeddedReviewBodyBytes,
  type HostedControlErrorBody,
} from "@withorbit/api";
import type { VaultID } from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import {
  HostedAccountError,
  requireHostedAccount,
  assertAccountIdentity,
  type HostedVaultAccountStore,
} from "./accounts/accountStore.js";
import {
  parseFirebaseIDAuthorization,
  type FirebaseIDTokenVerifier,
} from "./auth/firebaseIDTokenVerifier.js";
import type { HostedSyncServerConfiguration } from "./config.js";
import { resolveRoot } from "./http/resolveRoot.js";
import {
  EmbeddedBodyTooLargeError,
  EmbeddedReviews,
} from "./http/embeddedReviews.js";
import { SafeConsoleLogger, type ServiceLogger } from "./logging/safeLogger.js";
import { AuthenticatedWebSocketRouter } from "./network/authenticatedWebSocketRouter.js";
import { AccountRepoPool } from "./repo/accountRepoPool.js";
import type { HostedReminderController } from "./notifications/vaultReminderService.js";
import {
  isReminderAction,
  reminderConfirmationHTML,
} from "./notifications/reminderActions.js";

const maximumControlBodyBytes = 16 * 1_024;

export class HostedSyncService {
  private readonly repos: AccountRepoPool;
  private readonly socketRouter: AuthenticatedWebSocketRouter;
  private readonly server = createServer((request, response) => {
    void this.handleRequest(request, response);
  });
  private readonly rateLimiter: FixedWindowRateLimiter;
  private readonly logger: ServiceLogger;
  private readonly reminders?: HostedReminderController;
  private readonly embeddedReviews: EmbeddedReviews;

  constructor(
    private readonly configuration: HostedSyncServerConfiguration,
    private readonly dependencies: {
      accounts: HostedVaultAccountStore;
      verifier: FirebaseIDTokenVerifier;
      logger?: ServiceLogger;
      createReminders?: (repos: AccountRepoPool) => HostedReminderController;
    },
  ) {
    const logger = dependencies.logger ?? new SafeConsoleLogger();
    this.logger = logger;
    this.repos = new AccountRepoPool({
      storageRoot: configuration.storageRoot,
      maximumLoadedAccounts: configuration.maximumLoadedAccounts,
      maximumSocketsPerAccount: configuration.maximumSocketsPerAccount,
      maximumStorageBytesPerAccount:
        configuration.maximumStorageBytesPerAccount,
      storageConcurrency: configuration.storageConcurrency,
      idleRepoTimeoutMillis: configuration.idleRepoTimeoutMillis,
      recycleAfterRepoCreations: configuration.recycleAfterRepoCreations,
      recycleRSSBytes: configuration.recycleRSSBytes,
    });
    this.reminders = dependencies.createReminders?.(this.repos);
    this.embeddedReviews = new EmbeddedReviews(this.repos);
    this.socketRouter = new AuthenticatedWebSocketRouter(
      {
        accounts: dependencies.accounts,
        verifier: dependencies.verifier,
        repos: this.repos,
        logger,
      },
      {
        path: "/v1/sync",
        allowedOrigins: configuration.allowedOrigins,
        maximumSockets: configuration.maximumSockets,
        maximumMessageBytes: configuration.maximumMessageBytes,
        maximumAdmissionFrameBytes: configuration.maximumAdmissionFrameBytes,
        admissionTimeoutMillis: configuration.admissionTimeoutMillis,
        maximumMessagesPerMinute: configuration.maximumMessagesPerMinute,
        maximumSocketLifetimeMillis: configuration.maximumSocketLifetimeMillis,
      },
    );
    this.rateLimiter = new FixedWindowRateLimiter(
      configuration.maximumControlRequestsPerMinute,
    );
    this.server.on("upgrade", (request, socket, head) =>
      this.socketRouter.handleUpgrade(request, socket, head),
    );
    this.server.on("clientError", (_error, socket) => socket.destroy());
  }

  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(
        this.configuration.port,
        this.configuration.host,
        resolve,
      );
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Hosted sync service did not bind a TCP port");
    }
    this.reminders?.start();
    return address as AddressInfo;
  }

  async beginDrain() {
    await this.repos.drain();
  }

  async shutdown() {
    await this.beginDrain();
    await this.reminders?.stop();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.socketRouter.close();
    await this.repos.shutdown();
    this.reminders?.close();
  }

  async metrics() {
    return {
      ...(await this.repos.metrics()),
      sockets: this.socketRouter.metrics(),
    };
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const url = new URL(request.url ?? "/", "http://sync.invalid");
    const origin = request.headers.origin;
    if (origin && !this.configuration.allowedOrigins.has(origin)) {
      writeJSON(response, 403, { error: "authentication-required" });
      return;
    }
    const cors = corsHeaders(origin);
    if (url.pathname === "/notifications" && this.reminders) {
      await this.handleReminderAction(request, response, url, cors);
      return;
    }
    if (request.method === "OPTIONS") {
      if (
        !origin ||
        !this.configuration.allowedOrigins.has(origin) ||
        !isAllowedPreflight(request)
      ) {
        writeJSON(response, 403, { error: "authentication-required" });
        return;
      }
      response.writeHead(204, {
        ...cors,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
      });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/_health") {
      writeJSON(response, 200, { healthy: true }, cors);
      return;
    }
    if (request.method === "GET" && url.pathname === "/_ready") {
      writeJSON(
        response,
        this.repos.isDraining ? 503 : 200,
        { ready: !this.repos.isDraining },
        cors,
      );
      return;
    }
    if (
      request.method === "GET" &&
      url.pathname === "/_metrics" &&
      this.configuration.exposeMetrics
    ) {
      writeJSON(response, 200, await this.metrics(), cors);
      return;
    }
    if (request.method !== "POST" || url.search !== "") {
      writeJSON(response, 404, { error: "invalid-request" }, cors);
      return;
    }
    const remoteAddress = request.socket.remoteAddress ?? "unknown";
    if (!this.rateLimiter.accept(remoteAddress, Date.now())) {
      writeJSON(response, 429, { error: "rate-limited" }, cors);
      return;
    }
    try {
      const principal = await this.verifyRequestIdentity(
        request.headers.authorization,
      );
      const embedded =
        url.pathname === "/v1/embedded/reviews" ||
        url.pathname === "/v1/embedded/projections";
      const body = await readJSONBody(
        request,
        url.pathname === "/v1/embedded/reviews"
          ? maximumEmbeddedReviewBodyBytes
          : maximumControlBodyBytes,
      );
      const nowTimestampMillis = Date.now();
      if (embedded) {
        const root = await this.resolveAccountRoot(
          principal,
          nowTimestampMillis,
        );
        writeJSON(
          response,
          200,
          url.pathname === "/v1/embedded/reviews"
            ? await this.embeddedReviews.reviews(root, body)
            : await this.embeddedReviews.projections(root, body),
          cors,
        );
        return;
      }
      switch (url.pathname) {
        case "/v1/notification-settings": {
          if (!this.reminders || !body || typeof body !== "object")
            throw new TypeError("Reminders unavailable");
          const account = requireHostedAccount(
            await this.dependencies.accounts.getBySubject(principal.subject),
          );
          assertAccountIdentity(account, principal);
          const action = (body as Record<string, unknown>).action;
          if (action !== undefined) {
            if (!isReminderAction(action))
              throw new TypeError("Invalid reminder action");
            await this.reminders.update(
              principal.subject,
              action,
              nowTimestampMillis,
            );
          }
          writeJSON(
            response,
            200,
            {
              preferences: await this.reminders.preferences(principal.subject),
            },
            cors,
          );
          return;
        }
        case "/v1/hosted-roots:resolve":
          writeJSON(
            response,
            200,
            await this.resolveAccountRoot(principal, nowTimestampMillis, body),
            cors,
          );
          return;
        default:
          writeJSON(response, 404, { error: "invalid-request" }, cors);
      }
    } catch (error) {
      this.respondToError(response, error, cors);
    }
  }

  private resolveAccountRoot(
    principal: Awaited<ReturnType<FirebaseIDTokenVerifier["verifyIDToken"]>>,
    nowTimestampMillis: number,
    body: unknown = {},
  ) {
    return resolveRoot({
      body,
      principal,
      accounts: this.dependencies.accounts,
      nowTimestampMillis,
      createRoot: (account) =>
        this.repos.withRepo(account.hostedVaultID, async (repo) => {
          const vault = await PerTaskRepository.createEmpty(
            new RepoPerTaskDocuments(repo),
            {
              vaultID: account.hostedVaultID as VaultID,
              createdAtTimestampMillis: account.registrationTimestampMillis,
            },
          );
          try {
            await repo.flush();
            return vault.rootURL;
          } finally {
            await vault.close();
          }
        }),
    });
  }

  private respondToError(
    response: ServerResponse,
    error: unknown,
    headers: Record<string, string>,
  ) {
    if (error instanceof EmbeddedBodyTooLargeError) {
      writeJSON(response, 413, { error: "body-too-large" }, headers);
      return;
    }
    if (error instanceof HostedAccountError) {
      if (error.code === "invalid-account-record") {
        this.logger.error("sync_account_record_invalid", error);
        writeJSON(response, 503, { error: "service-unavailable" }, headers);
        return;
      }
      const status = error.code === "account-not-provisioned" ? 404 : 409;
      writeJSON(response, status, { error: error.code }, headers);
      return;
    }
    if (error instanceof TypeError || error instanceof SyntaxError) {
      writeJSON(response, 400, { error: "invalid-request" }, headers);
      return;
    }
    if (error instanceof AuthenticationRequiredError) {
      writeJSON(response, 401, { error: "authentication-required" }, headers);
      return;
    }
    this.logger.error("sync_control_request_failed", error);
    writeJSON(response, 503, { error: "service-unavailable" }, headers);
  }

  private async handleReminderAction(
    request: IncomingMessage,
    response: ServerResponse,
    url: URL,
    cors: Record<string, string>,
  ) {
    if (
      !this.rateLimiter.accept(
        request.socket.remoteAddress ?? "unknown",
        Date.now(),
      )
    ) {
      writeJSON(response, 429, { error: "rate-limited" }, cors);
      return;
    }
    try {
      const token = url.searchParams.get("token");
      const action = url.searchParams.get("action");
      if (!token || !isReminderAction(action))
        throw new TypeError("Invalid reminder action");
      const subject = this.reminders!.actionTokens.verify(token, Date.now());
      if (request.method === "GET") {
        // Link scanners only see confirmation. No setting is changed by GET.
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
        });
        response.end(reminderConfirmationHTML(action));
      } else if (request.method === "POST") {
        await this.reminders!.update(subject, action, Date.now());
        response.writeHead(303, {
          Location: `https://withorbit.com/settings?completedAction=${action}`,
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        });
        response.end();
      } else {
        response.writeHead(405, { Allow: "GET, POST" });
        response.end();
      }
    } catch (error) {
      this.respondToError(response, error, cors);
    }
  }

  private async verifyRequestIdentity(authorization: string | undefined) {
    try {
      return await this.dependencies.verifier.verifyIDToken(
        parseFirebaseIDAuthorization(authorization),
      );
    } catch {
      // Firebase verification intentionally shares the same non-descriptive
      // response and never serializes the SDK error or supplied credential.
      throw new AuthenticationRequiredError();
    }
  }
}

class AuthenticationRequiredError extends Error {}

async function readJSONBody(request: IncomingMessage, maximumBytes: number) {
  const contentType = request.headers["content-type"];
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    throw new TypeError("Expected JSON body");
  }
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > maximumBytes) {
      throw new EmbeddedBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        Vary: "Origin",
      }
    : {};
}

function isAllowedPreflight(request: IncomingMessage) {
  if (request.headers["access-control-request-method"] !== "POST") {
    return false;
  }
  const headers = String(
    request.headers["access-control-request-headers"] ?? "",
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return (
    headers.length > 0 &&
    headers.every(
      (header) => header === "authorization" || header === "content-type",
    )
  );
}

function writeJSON(
  response: ServerResponse,
  status: number,
  body: HostedControlErrorBody | object,
  headers: Record<string, string> = {},
) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    ...headers,
    "Cache-Control": "no-store, max-age=0",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(encoded),
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

class FixedWindowRateLimiter {
  private readonly maximumKeys = 10_000;
  private readonly windows = new Map<
    string,
    { startedAtTimestampMillis: number; count: number }
  >();

  constructor(private readonly maximumPerMinute: number) {}

  accept(key: string, nowTimestampMillis: number) {
    const previous = this.windows.get(key);
    if (
      !previous ||
      nowTimestampMillis - previous.startedAtTimestampMillis >= 60_000
    ) {
      if (!previous && this.windows.size >= this.maximumKeys) {
        for (const [candidate, window] of this.windows) {
          if (nowTimestampMillis - window.startedAtTimestampMillis >= 60_000) {
            this.windows.delete(candidate);
          }
        }
        if (this.windows.size >= this.maximumKeys) return false;
      }
      this.windows.set(key, {
        startedAtTimestampMillis: nowTimestampMillis,
        count: 1,
      });
      return true;
    }
    previous.count++;
    return previous.count <= this.maximumPerMinute;
  }
}
