import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
  type PeerId,
  type PeerMetadata,
} from "@automerge/automerge-repo";
import { WebSocketServerAdapter } from "@automerge/automerge-repo-network-websocket";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import type { AutomergeDocumentURL } from "@withorbit/core";
import type { LabVaultRoot } from "@withorbit/api";
import { bearerToken, pairedTokenMatches } from "./auth/pairing.js";
import type { LabConfiguration } from "./config.js";
import { AuthenticatedWebSocketRouter } from "./network/authenticatedWebSocketRouter.js";
import { AtomicNodeFSStorageAdapter } from "./storage/atomicNodeFSStorageAdapter.js";
import {
  acquireWriterLock,
  ensureStorageID,
} from "./storage/storageMetadata.js";
import { createUpdatesRequestHandler } from "./updates/handler.js";

export class LabSyncService {
  private draining = false;
  private stopping?: Promise<void>;
  private releaseLock?: () => Promise<void>;
  private readonly storage: AtomicNodeFSStorageAdapter;
  private repo?: Repo;
  private readonly router: AuthenticatedWebSocketRouter;
  private readonly updates: ReturnType<typeof createUpdatesRequestHandler>;
  private readonly server = createServer((request, response) => {
    void this.handleRequest(request, response).catch(() => {
      if (!response.headersSent)
        writeJSON(response, 500, { error: "service-unavailable" });
      else response.destroy();
    });
  });

  constructor(readonly configuration: LabConfiguration) {
    this.storage = new AtomicNodeFSStorageAdapter(configuration.storageRoot);
    this.router = new AuthenticatedWebSocketRouter(
      configuration.pairingToken,
      configuration.allowedOrigins,
      () => this.draining,
    );
    this.updates = createUpdatesRequestHandler({
      updatesRoot: configuration.updatesRoot,
    });
    this.server.on("upgrade", (request, socket, head) =>
      this.router.handleUpgrade(request, socket, head),
    );
    this.server.on("clientError", (_error, socket) => socket.destroy());
  }

  async start(): Promise<AddressInfo> {
    try {
      this.releaseLock = await acquireWriterLock(
        this.configuration.storageRoot,
      );
      const id = parseAutomergeUrl(
        this.configuration.rootDocumentURL as AutomergeUrl,
      ).documentId;
      const chunks = await this.storage.loadRange([id]);
      if (
        !chunks.some(
          ({ key }) => key[1] === "snapshot" || key[1] === "incremental",
        )
      )
        throw new Error(
          "Imported Orbit Lab root is absent; restore its data rather than create a replacement",
        );
      await ensureStorageID(this.storage);
      const network = new ReadyWebSocketServerAdapter(this.router.socketServer);
      this.repo = new Repo({
        storage: this.storage,
        network: [network],
        isEphemeral: false,
        enableRemoteHeadsGossiping: true,
        shareConfig: { announce: async () => false, access: async () => true },
        flushConcurrency: 16,
        syncStateLoadConcurrency: 16,
        sharePolicyConcurrency: 16,
      });
      await network.whenListening();
      const documents = new RepoPerTaskDocuments(this.repo);
      try {
        const snapshot = await documents.read(
          this.configuration.rootDocumentURL as AutomergeDocumentURL,
          { localOnly: true },
        );
        const root = snapshot?.data as Record<string, unknown> | undefined;
        if (
          root?.documentType !== "com.withorbit.vault-root" ||
          root.schemaVersion !== 2
        )
          throw new Error(
            "Imported Orbit Lab root is unreadable or incompatible",
          );
      } finally {
        await documents.close();
      }
      await new Promise<void>((resolve, reject) => {
        this.server.once("error", reject);
        this.server.listen(this.configuration.port, "127.0.0.1", resolve);
      });
      return this.server.address() as AddressInfo;
    } catch (error) {
      await this.shutdown();
      throw error;
    }
  }

  shutdown(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.draining = true;
    this.stopping = this.stop();
    return this.stopping;
  }

  private async stop() {
    this.router.close();
    try {
      await new Promise<void>((resolve) => this.server.close(() => resolve()));
      await this.repo?.flush();
    } finally {
      try {
        await this.repo?.shutdown();
      } finally {
        await this.storage.close();
        await this.releaseLock?.();
        this.releaseLock = undefined;
      }
    }
  }

  metrics() {
    return {
      ...this.router.metrics(),
      loadedDocuments: Object.keys(this.repo?.handles ?? {}).length,
      storage: { ...this.storage.metrics },
      rssBytes: process.memoryUsage().rss,
    };
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ) {
    const url = new URL(request.url ?? "/", "http://lab.invalid");
    const origin = request.headers.origin;
    if (origin && !this.configuration.allowedOrigins.has(origin))
      return writeJSON(response, 403, { error: "authentication-required" });
    if (origin) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      });
      response.end();
      return;
    }
    if (request.method === "GET" && url.pathname === "/_health")
      return writeJSON(response, 200, { healthy: true });
    if (request.method === "GET" && url.pathname === "/_ready")
      return writeJSON(response, this.draining ? 503 : 200, {
        ready: !this.draining,
      });
    // Updates are read-only and reachable only through loopback/Tailscale Serve.
    // Expo's assets may not carry the manifest Authorization header; never put the pairing key in executable bundles.
    if (await this.updates(request, response)) return;
    if (request.method !== "POST" || url.pathname !== "/v1/root" || url.search)
      return writeJSON(response, 404, { error: "invalid-request" });
    if (
      !pairedTokenMatches(
        bearerToken(request.headers.authorization),
        this.configuration.pairingToken,
      )
    )
      return writeJSON(response, 401, { error: "authentication-required" });
    if (this.draining)
      return writeJSON(response, 503, { error: "service-unavailable" });
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 4096)
        return writeJSON(response, 413, { error: "body-too-large" });
    }
    const root: LabVaultRoot = {
      rootDocumentURL: this.configuration.rootDocumentURL as AutomergeDocumentURL,
    };
    writeJSON(response, 200, root);
  }
}

function writeJSON(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

class ReadyWebSocketServerAdapter extends WebSocketServerAdapter {
  private resolveListening!: () => void;
  private readonly listening = new Promise<void>((resolve) => {
    this.resolveListening = resolve;
  });
  override connect(peerId: PeerId, metadata?: PeerMetadata) {
    super.connect(peerId, metadata);
    this.resolveListening();
  }
  whenListening() {
    return this.listening;
  }
}
