import type { HostedSyncCredential } from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";
import type { EventSubscription } from "expo-modules-core";
import type { NativePerTaskDocuments } from "../vault/nativePerTaskDocuments.js";

export interface NativeHostedSyncTransportOptions {
  websocketURL: string;
  requestCredential: () => Promise<HostedSyncCredential>;
  localStoreID: string;
  retryIntervalMillis?: number;
  connectionTimeoutMillis?: number;
  documentTimeoutMillis?: number;
}

/**
 * Auth lifecycle around Repo Swift's WebSocketProvider. Repo Swift owns Repo
 * messages, sync states, document merging, and reconnect-safe file storage;
 * this class supplies the paired credential for each connection.
 */
export class NativeHostedSyncTransport {
  private readonly trackedDocuments = new Set<AutomergeDocumentURL>();
  private readonly pendingDocuments = new Set<AutomergeDocumentURL>();
  private readonly subscriptions: EventSubscription[];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectOperation: Promise<void> | null = null;
  private generation = 0;
  private refreshedGeneration = 0;
  private started = false;
  private ready = false;
  private hasConnected = false;
  private closed = false;

  constructor(
    private readonly documents: NativePerTaskDocuments,
    private readonly options: NativeHostedSyncTransportOptions,
  ) {
    if (
      documents.localStoreID &&
      documents.localStoreID !== options.localStoreID
    ) {
      throw new Error("Native Repo store identity does not match sync binding");
    }
    this.subscriptions = [
      documents.native.addListener("onRepoSyncStateChanged", (event) => {
        if (event.localStoreID !== this.options.localStoreID || this.closed) {
          return;
        }
        if (event.state === "ready") {
          this.markReady(this.generation);
          return;
        }
        if (event.state !== "disconnected") return;
        this.ready = false;
        if (this.started && this.hasConnected) this.scheduleReconnect();
      }),
    ];
  }

  connect(): Promise<void> {
    if (this.closed) {
      return Promise.reject(
        new Error("Native hosted sync transport is closed"),
      );
    }
    this.started = true;
    if (this.ready) return Promise.resolve();
    if (this.connectOperation) return this.connectOperation;
    return this.establish();
  }

  isReady(): boolean {
    return this.ready;
  }

  async ensureDocument(
    documentURL: AutomergeDocumentURL,
    timeoutMillis = this.options.documentTimeoutMillis ?? 20_000,
  ): Promise<boolean> {
    if (this.closed) {
      throw new Error("Native hosted sync transport is closed");
    }
    this.trackedDocuments.add(documentURL);
    this.pendingDocuments.add(documentURL);
    // Catalog repair can request a remote-only task during local opening,
    // before bootstrap starts the background connection. Repo Swift's find
    // with no peer leaves a requesting handle that later becomes unavailable;
    // peer admission itself then waits on that handle. Only local documents
    // may be opened before admission, and they must remain usable offline.
    try {
      if (!this.ready && !(await this.documents.containsMany([documentURL]))[0])
        await this.connect();
      return await withTimeout(
        this.documents.native.ensureRepoDocument(
          this.options.localStoreID,
          documentURL,
        ),
        timeoutMillis,
        "Timed out fetching native Automerge document",
      );
    } finally {
      this.pendingDocuments.delete(documentURL);
    }
  }

  ensureDocuments(
    documentURLs: readonly AutomergeDocumentURL[],
    timeoutMillis = this.options.documentTimeoutMillis ?? 20_000,
  ): Promise<boolean[]> {
    // Repo Swift's resolver polls for completed network requests. Starting a
    // queue-sized working set together lets those waits overlap; awaiting each
    // document serially would add one polling interval per document.
    return Promise.all(
      documentURLs.map((documentURL) =>
        this.ensureDocument(documentURL, timeoutMillis),
      ),
    );
  }

  /** Repo observes imported document changes and syncs them automatically. */
  documentChanged(documentURL: AutomergeDocumentURL) {
    if (this.closed) return;
    this.trackedDocuments.add(documentURL);
    if (this.ready) void this.refreshDocument(documentURL);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.started = false;
    this.ready = false;
    this.generation++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    for (const subscription of this.subscriptions) subscription.remove();
    const connection = this.connectOperation;
    await this.documents.native.disconnectRepo(this.options.localStoreID);
    if (connection) {
      await connection.catch(() => undefined);
      await this.documents.native.disconnectRepo(this.options.localStoreID);
    }
  }

  private establish(): Promise<void> {
    const generation = ++this.generation;
    let failed = false;
    let active = true;
    const operation = withTimeout(
      this.primeTrackedDocuments().then(() =>
        this.options.requestCredential().then((credential) => {
          if (!active || this.closed || generation !== this.generation) return;
          return this.documents.native.connectRepo(
            this.options.localStoreID,
            this.options.websocketURL,
            credential.token,
          );
        }),
      ),
      this.options.connectionTimeoutMillis ?? 20_000,
      "Timed out connecting to Orbit Sync",
    )
      .then(() => {
        if (this.closed || generation !== this.generation) return;
        this.markReady(generation);
      })
      .catch((error: unknown) => {
        failed = true;
        throw asError(error);
      })
      .finally(() => {
        active = false;
        if (this.connectOperation !== operation) return;
        this.connectOperation = null;
        if (failed && this.started) this.scheduleReconnect();
      });
    this.connectOperation = operation;
    return operation;
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer || this.connectOperation) return;
    const generation = this.generation;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed || generation !== this.generation) return;
      void this.establish().catch(() => undefined);
    }, this.options.retryIntervalMillis ?? 1_000);
  }

  private markReady(generation: number) {
    if (this.closed || generation !== this.generation) return;
    this.ready = true;
    this.hasConnected = true;
    if (this.refreshedGeneration === generation) return;
    this.refreshedGeneration = generation;

    // Documents materialized from local files before the socket became ready
    // are already known to JavaScript, but Repo Swift has not necessarily
    // announced them to the new peer. Re-find the working set on every
    // connection so warm launches and reconnects receive remote changes.
    for (const documentURL of this.trackedDocuments) {
      if (!this.pendingDocuments.has(documentURL))
        void this.refreshDocument(documentURL);
    }
  }

  private async primeTrackedDocuments() {
    // Repo Swift's peer-join sweep only includes handles already loaded into
    // the Repo. A warm vault knows its on-disk working set before connecting,
    // so materialize those handles first and let the ordinary join protocol
    // synchronize them. This work remains off the local-first launch path
    // because warm callers intentionally do not await connect().
    const tracked = [...this.trackedDocuments];
    const local = await this.documents.containsMany(tracked);
    await Promise.all(
      tracked
        .filter((_, index) => local[index])
        .map((documentURL) =>
          this.documents.native
            .ensureRepoDocument(this.options.localStoreID, documentURL)
            .catch(() => false),
        ),
    );
  }

  private async refreshDocument(documentURL: AutomergeDocumentURL) {
    try {
      await this.documents.native.ensureRepoDocument(
        this.options.localStoreID,
        documentURL,
      );
    } catch {
      // This is opportunistic reconnect repair. Foreground reads retain their
      // normal timeout/error path, and the next connection retries the set.
    }
  }
}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMillis: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMillis) || timeoutMillis <= 0) {
    throw new Error("Invalid native Repo timeout");
  }
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMillis);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Orbit Sync failed");
}
