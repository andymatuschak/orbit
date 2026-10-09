import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type {
  HostedSyncAdmissionAcceptedFrame,
  HostedSyncAdmissionFrame,
} from "@withorbit/api";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  assertAccountIdentity,
  requireBoundHostedAccount,
  type HostedVaultAccountStore,
} from "../accounts/accountStore.js";
import {
  parseFirebaseIDAuthorization,
  type FirebaseIDTokenVerifier,
} from "../auth/firebaseIDTokenVerifier.js";
import type { ServiceLogger } from "../logging/safeLogger.js";
import { AccountRepoPool } from "../repo/accountRepoPool.js";

export interface AuthenticatedWebSocketRouterOptions {
  path: string;
  allowedOrigins: ReadonlySet<string>;
  maximumSockets: number;
  maximumMessageBytes: number;
  maximumAdmissionFrameBytes: number;
  admissionTimeoutMillis: number;
  maximumMessagesPerMinute: number;
  maximumSocketLifetimeMillis: number;
}

export interface AuthenticatedWebSocketMetrics {
  acceptedSockets: number;
  rejectedSockets: number;
  activeSockets: number;
  inboundMessages: number;
  inboundBytes: number;
  rateLimitClosures: number;
  lifetimeClosures: number;
}

export class AuthenticatedWebSocketRouter {
  private readonly server: WebSocketServer;
  private readonly counters: AuthenticatedWebSocketMetrics = {
    acceptedSockets: 0,
    rejectedSockets: 0,
    activeSockets: 0,
    inboundMessages: 0,
    inboundBytes: 0,
    rateLimitClosures: 0,
    lifetimeClosures: 0,
  };

  constructor(
    private readonly dependencies: {
      verifier: FirebaseIDTokenVerifier;
      accounts: HostedVaultAccountStore;
      repos: AccountRepoPool;
      logger: ServiceLogger;
    },
    private readonly options: AuthenticatedWebSocketRouterOptions,
  ) {
    this.server = new WebSocketServer({
      noServer: true,
      maxPayload: options.maximumMessageBytes,
      perMessageDeflate: false,
    });
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer) {
    const url = new URL(request.url ?? "/", "http://sync.invalid");
    let nativeIDToken: string | null;
    try {
      nativeIDToken = decodeNativeIDToken(request);
      if (
        nativeIDToken !== null &&
        Buffer.byteLength(nativeIDToken) >
          this.options.maximumAdmissionFrameBytes
      ) {
        throw new TypeError("Firebase ID token is too large");
      }
    } catch {
      this.rejectUpgrade(socket);
      return;
    }
    if (
      url.pathname !== this.options.path ||
      url.search !== "" ||
      !this.originAllowed(request.headers.origin, nativeIDToken !== null) ||
      this.counters.activeSockets >= this.options.maximumSockets ||
      this.dependencies.repos.isDraining
    ) {
      this.rejectUpgrade(socket);
      return;
    }
    this.server.handleUpgrade(request, socket, head, (webSocket) => {
      this.counters.activeSockets++;
      webSocket.once("close", () => {
        this.counters.activeSockets = Math.max(
          0,
          this.counters.activeSockets - 1,
        );
      });
      this.awaitAdmission(webSocket, request, nativeIDToken);
    });
  }

  metrics(): AuthenticatedWebSocketMetrics {
    return { ...this.counters };
  }

  close() {
    for (const socket of this.server.clients) socket.terminate();
    this.server.close();
  }

  private awaitAdmission(
    socket: WebSocket,
    request: IncomingMessage,
    nativeIDToken: string | null,
  ) {
    let state: "waiting" | "authenticating" | "admitted" | "closed" = "waiting";
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
    };
    const reject = (error?: unknown) => {
      if (state === "admitted" || state === "closed") return;
      state = "closed";
      cleanup();
      // A paused native socket must read the close handshake, even when its
      // credential verifier never settles. Late results cannot reopen it.
      if (nativeIDToken !== null) socket.resume();
      if (error !== undefined)
        this.dependencies.logger.error("sync_socket_rejected", error);
      this.rejectSocket(socket);
    };
    const timeout = setTimeout(reject, this.options.admissionTimeoutMillis);
    timeout.unref?.();

    const authenticate = (
      firebaseIDToken: string,
      beforeRepoFrames?: () => void,
    ) => {
      state = "authenticating";
      void this.admitCredential(
        socket,
        request,
        firebaseIDToken,
        beforeRepoFrames,
      )
        .then(() => {
          if (state === "closed") return;
          state = "admitted";
          cleanup();
          if (nativeIDToken !== null) socket.resume();
        })
        .catch(reject);
    };
    const onMessage = (data: RawData, isBinary: boolean) => {
      if (state !== "waiting") {
        reject(new Error("Unexpected pre-admission frame"));
        return;
      }
      try {
        if (
          isBinary ||
          rawDataByteLength(data) > this.options.maximumAdmissionFrameBytes
        )
          throw new Error("Invalid admission frame");
        const frame = decodeAdmissionFrame(data.toString());
        authenticate(frame.firebaseIDToken, () => {
          const accepted: HostedSyncAdmissionAcceptedFrame = {
            type: "orbit-sync-admission-accepted",
            protocolVersion: 1,
          };
          socket.send(JSON.stringify(accepted));
        });
      } catch (error) {
        reject(error);
      }
    };
    socket.once("close", () => {
      state = "closed";
      cleanup();
    });
    if (nativeIDToken !== null) {
      // Repo Swift sends `join` first and supplies the ID token through
      // URLSession's upgrade header. Pause reads until admission so its ordinary
      // provider needs no application-owned wrapper or fork.
      socket.pause();
      authenticate(nativeIDToken);
    } else {
      socket.on("message", onMessage);
    }
  }

  private async admitCredential(
    socket: WebSocket,
    request: IncomingMessage,
    firebaseIDToken: string,
    beforeRepoFrames?: () => void,
  ) {
    const principal =
      await this.dependencies.verifier.verifyIDToken(firebaseIDToken);
    if (socket.readyState !== 1) {
      throw new Error("Sync socket closed during authentication");
    }
    const account = requireBoundHostedAccount(
      await this.dependencies.accounts.getBySubject(principal.subject),
    );
    assertAccountIdentity(account, principal);
    if (socket.readyState !== 1) {
      throw new Error("Sync socket closed during authentication");
    }

    installRateLimit(socket, this.options, this.counters);
    const socketMustReauthenticateAtTimestampMillis = Math.min(
      Date.now() + this.options.maximumSocketLifetimeMillis,
      principal.expiresAtTimestampMillis,
    );
    const lifetime = Math.max(
      1,
      socketMustReauthenticateAtTimestampMillis - Date.now(),
    );
    if (socketMustReauthenticateAtTimestampMillis <= Date.now()) {
      throw new Error("Firebase identity expires too soon");
    }
    const lifetimeTimer = setTimeout(() => {
      this.counters.lifetimeClosures++;
      socket.close(4001, "reauthentication required");
    }, lifetime);
    lifetimeTimer.unref?.();
    socket.once("close", () => clearTimeout(lifetimeTimer));

    await this.dependencies.repos.attachSocket(
      account.hostedVaultID,
      socket,
      request,
      beforeRepoFrames,
    );
    this.counters.acceptedSockets++;
    this.dependencies.logger.event("sync_socket_admitted", {
      activeSockets: this.counters.activeSockets,
    });
  }

  private originAllowed(
    origin: string | undefined,
    isNativeAdmission: boolean,
  ) {
    // Browser WebSocket APIs cannot set Orbit's native admission headers. A
    // header-authenticated URLSession connection therefore needs no synthetic
    // web origin, while a supplied origin must still be one of Orbit's exact
    // configured values.
    if (isNativeAdmission && origin === undefined) return true;
    return origin !== undefined && this.options.allowedOrigins.has(origin);
  }

  private rejectUpgrade(socket: Duplex) {
    this.counters.rejectedSockets++;
    socket.write(
      "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
    );
    socket.destroy();
  }

  private rejectSocket(socket: WebSocket) {
    this.counters.rejectedSockets++;
    if (socket.readyState === 1) {
      socket.close(1008, "admission rejected");
    } else {
      socket.terminate();
    }
  }
}

function decodeNativeIDToken(request: IncomingMessage): string | null {
  if (request.headers.authorization === undefined) return null;
  return parseFirebaseIDAuthorization(request.headers.authorization);
}

function decodeAdmissionFrame(value: string): HostedSyncAdmissionFrame {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Malformed admission frame");
  }
  if (
    !isRecord(parsed) ||
    parsed.type !== "orbit-sync-admission" ||
    parsed.protocolVersion !== 1 ||
    typeof parsed.firebaseIDToken !== "string" ||
    parsed.firebaseIDToken.length === 0 ||
    /\s/.test(parsed.firebaseIDToken) ||
    Object.keys(parsed).some(
      (key) => !["type", "protocolVersion", "firebaseIDToken"].includes(key),
    )
  ) {
    throw new Error("Invalid admission frame");
  }
  return parsed as unknown as HostedSyncAdmissionFrame;
}

function installRateLimit(
  socket: WebSocket,
  options: AuthenticatedWebSocketRouterOptions,
  counters: AuthenticatedWebSocketMetrics,
) {
  let windowStartedAt = Date.now();
  let messages = 0;
  const listener = (data: RawData) => {
    const now = Date.now();
    if (now - windowStartedAt >= 60_000) {
      windowStartedAt = now;
      messages = 0;
    }
    messages++;
    counters.inboundMessages++;
    counters.inboundBytes += rawDataByteLength(data);
    if (messages > options.maximumMessagesPerMinute) {
      counters.rateLimitClosures++;
      socket.close(1008, "rate limit exceeded");
    }
  };
  socket.on("message", listener);
  socket.once("close", () => socket.off("message", listener));
}

function rawDataByteLength(data: RawData) {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data)) {
    return data.reduce((total, value) => total + value.byteLength, 0);
  }
  return data.byteLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
