import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  Repo,
  type DocumentId,
  type PeerId,
  type PeerMetadata,
  type StorageId,
} from "@automerge/automerge-repo";
import { WebSocketServerAdapter } from "@automerge/automerge-repo-network-websocket";
import { WebSocketServer, type WebSocket } from "ws";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { AtomicNodeFSStorageAdapter } from "../storage/atomicNodeFSStorageAdapter.js";
import {
  accountStorageDirectory,
  ensureStorageID,
} from "../storage/accountStorage.js";

export class RepoPoolCapacityError extends Error {
  readonly name = "RepoPoolCapacityError";
}

interface AccountRepoHost {
  accountID: string;
  repo: Repo;
  socketServer: WebSocketServer;
  storage: AtomicNodeFSStorageAdapter;
  vault?: { rootURL: string; repository: Promise<PerTaskRepository> };
  storageID: StorageId;
  activeSockets: number;
  activeOperations: number;
  lastUsedAtTimestampMillis: number;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

export interface AccountRepoPoolMetrics {
  loadedAccountRepos: number;
  activeSockets: number;
  loadedDocuments: number;
  repoCreations: number;
  repoShutdowns: number;
  capacityRejections: number;
  coldLoadDurationMillis: number[];
  storageBytes: number;
  storageReads: number;
  storageWrites: number;
  rssBytes: number;
  heapUsedBytes: number;
  shouldRecycleProcess: boolean;
}

export interface AccountRepoPoolOptions {
  storageRoot: string;
  maximumLoadedAccounts: number;
  maximumSocketsPerAccount: number;
  maximumStorageBytesPerAccount: number;
  storageConcurrency: number;
  idleRepoTimeoutMillis: number;
  recycleAfterRepoCreations: number;
  recycleRSSBytes: number;
  now?: () => number;
}

/**
 * Bounds memory at the account-Repo level. We deliberately do not reproduce
 * Automerge Repo's pending consumer-driven document GC work: an idle account's
 * entire Repo is flushed, shut down, dereferenced, and later cold-opened.
 */
export class AccountRepoPool {
  private readonly accounts = new Map<string, AccountRepoHost>();
  private lifecycleOperation: Promise<unknown> = Promise.resolve();
  private repoCreations = 0;
  private repoShutdowns = 0;
  private capacityRejections = 0;
  private readonly coldLoadDurationMillis: number[] = [];
  private draining = false;
  private readonly now: () => number;

  constructor(private readonly options: AccountRepoPoolOptions) {
    this.now = options.now ?? Date.now;
  }

  async storageID(accountID: string) {
    return (await this.getOrCreate(accountID)).storageID;
  }

  /** Server readers/writers share the socket Repo, never a second disk writer. */
  async withRepo<T>(
    accountID: string,
    operation: (repo: Repo) => Promise<T>,
  ): Promise<T> {
    const account = await this.exclusiveLifecycle(async () => {
      const account = await this.getOrCreateUnlocked(accountID);
      account.activeOperations++;
      if (account.idleTimer) clearTimeout(account.idleTimer);
      account.idleTimer = null;
      return account;
    });
    try {
      return await operation(account.repo);
    } finally {
      account.activeOperations--;
      account.lastUsedAtTimestampMillis = this.now();
      if (account.activeOperations === 0 && account.activeSockets === 0)
        this.scheduleIdleShutdown(account);
    }
  }

  /** HTTP and reminders share one model owner and mutation queue on the socket Repo. */
  withVault<T>(
    accountID: string,
    rootURL: string,
    operation: (vault: PerTaskRepository, repo: Repo) => Promise<T>,
  ): Promise<T> {
    return this.withRepo(accountID, async (repo) => {
      const account = this.accounts.get(accountID)!;
      if (account.vault && account.vault.rootURL !== rootURL)
        throw new Error("Account root changed while its Repo was loaded");
      if (!account.vault) {
        const documents = new RepoPerTaskDocuments(repo);
        const vault: NonNullable<AccountRepoHost["vault"]> = {
          rootURL,
          repository: PerTaskRepository.open(
            documents,
            rootURL as AutomergeDocumentURL,
          ).catch(async (error: unknown) => {
            // Opening detaches its projection subscription, but this facade
            // still owns observers on the shared Repo's document handles.
            await documents.close();
            if (account.vault === vault) account.vault = undefined;
            throw error;
          }),
        };
        account.vault = vault;
      }
      return operation(await account.vault.repository, repo);
    });
  }

  async attachSocket(
    accountID: string,
    socket: WebSocket,
    request: IncomingMessage,
    beforeRepoFrames?: () => void,
  ) {
    const account = await this.acquireSocketSlot(accountID);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      account.socketServer.clients.delete(socket);
      account.activeSockets = Math.max(0, account.activeSockets - 1);
      account.lastUsedAtTimestampMillis = this.now();
      if (account.activeSockets === 0 && account.activeOperations === 0)
        this.scheduleIdleShutdown(account);
    };
    if (socket.readyState !== 1) {
      release();
      throw new Error("Cannot attach a closed sync socket");
    }

    // handleUpgrade normally maintains this set. The authenticated router owns
    // the upgrade and transfers an already-open socket, so account tracking is
    // explicit here.
    account.socketServer.clients.add(socket);
    socket.once("close", release);
    try {
      // WebSocketServerAdapter may synchronously enqueue its peer frame from
      // the connection event. Put Orbit's admission acknowledgement first on
      // the wire so clients never attempt to decode Repo CBOR as JSON.
      beforeRepoFrames?.();
      account.socketServer.emit("connection", socket, request);
    } catch (error) {
      socket.off("close", release);
      release();
      throw error;
    }
    return account.storageID;
  }

  async evictIdle(nowTimestampMillis = this.now()) {
    return this.exclusiveLifecycle(async () => {
      const candidates = [...this.accounts.values()]
        .filter(
          (account) =>
            account.activeSockets === 0 &&
            account.activeOperations === 0 &&
            nowTimestampMillis - account.lastUsedAtTimestampMillis >=
              this.options.idleRepoTimeoutMillis,
        )
        .sort(
          (left, right) =>
            left.lastUsedAtTimestampMillis - right.lastUsedAtTimestampMillis,
        );
      for (const account of candidates) {
        await this.shutdownAccountUnlocked(account);
      }
      return candidates.length;
    });
  }

  async drain() {
    this.draining = true;
    for (const account of [...this.accounts.values()]) {
      for (const socket of account.socketServer.clients) {
        socket.close(1012, "service restart");
      }
    }
  }

  async shutdown() {
    await this.drain();
    await this.exclusiveLifecycle(async () => {
      for (const account of [...this.accounts.values()]) {
        await this.shutdownAccountUnlocked(account, true);
      }
    });
  }

  async metrics(): Promise<AccountRepoPoolMetrics> {
    const accounts = [...this.accounts.values()];
    const memory = process.memoryUsage();
    return {
      loadedAccountRepos: accounts.length,
      activeSockets: sum(accounts, (account) => account.activeSockets),
      loadedDocuments: sum(
        accounts,
        (account) => Object.keys(account.repo.handles).length,
      ),
      repoCreations: this.repoCreations,
      repoShutdowns: this.repoShutdowns,
      capacityRejections: this.capacityRejections,
      coldLoadDurationMillis: [...this.coldLoadDurationMillis.slice(-100)],
      storageBytes: sum(
        await Promise.all(
          accounts.map((account) => account.storage.byteLength()),
        ),
        (bytes) => bytes,
      ),
      storageReads: sum(accounts, (account) => account.storage.metrics.loads),
      storageWrites: sum(accounts, (account) => account.storage.metrics.saves),
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      shouldRecycleProcess:
        this.repoCreations >= this.options.recycleAfterRepoCreations ||
        memory.rss >= this.options.recycleRSSBytes,
    };
  }

  get isDraining() {
    return this.draining;
  }

  private async getOrCreate(accountID: string) {
    return this.exclusiveLifecycle(() => this.getOrCreateUnlocked(accountID));
  }

  private async getOrCreateUnlocked(accountID: string) {
    if (this.draining) throw new RepoPoolCapacityError("Service is draining");
    const existing = this.accounts.get(accountID);
    if (existing) {
      existing.lastUsedAtTimestampMillis = this.now();
      return existing;
    }
    await this.makeCapacityUnlocked();
    return this.createUnlocked(accountID);
  }

  private async acquireSocketSlot(accountID: string) {
    return this.exclusiveLifecycle(async () => {
      const account = await this.getOrCreateUnlocked(accountID);
      if (account.activeSockets >= this.options.maximumSocketsPerAccount) {
        this.capacityRejections++;
        throw new RepoPoolCapacityError("Account socket limit reached");
      }
      account.activeSockets++;
      account.lastUsedAtTimestampMillis = this.now();
      if (account.idleTimer) clearTimeout(account.idleTimer);
      account.idleTimer = null;
      return account;
    });
  }

  private async createUnlocked(accountID: string): Promise<AccountRepoHost> {
    const started = performance.now();
    const storage = new AtomicNodeFSStorageAdapter(
      accountStorageDirectory(this.options.storageRoot, accountID),
      this.options.storageConcurrency,
      this.options.maximumStorageBytesPerAccount,
    );
    const storageID = await ensureStorageID(storage);
    const socketServer = new WebSocketServer({ noServer: true });
    const network = new ReadyWebSocketServerAdapter(socketServer, 10_000);
    const repo = new Repo({
      peerId: `orbit-host-${randomUUID()}` as PeerId,
      isEphemeral: false,
      storage,
      network: [network],
      enableRemoteHeadsGossiping: true,
      shareConfig: {
        announce: async () => false,
        access: async () => true,
      },
      flushConcurrency: Math.min(16, this.options.storageConcurrency),
      syncStateLoadConcurrency: Math.min(16, this.options.storageConcurrency),
      sharePolicyConcurrency: 16,
    });
    // Repo resolves its storage metadata before calling adapter.connect(). Do
    // not transfer an already-open socket until the adapter's connection
    // listener is actually installed, or an eager native `join` can be lost.
    await network.whenListening();
    const account: AccountRepoHost = {
      accountID,
      repo,
      socketServer,
      storage,
      storageID,
      activeSockets: 0,
      activeOperations: 0,
      lastUsedAtTimestampMillis: this.now(),
      idleTimer: null,
    };
    this.accounts.set(accountID, account);
    this.repoCreations++;
    this.coldLoadDurationMillis.push(performance.now() - started);
    this.scheduleIdleShutdown(account);
    return account;
  }

  private async makeCapacityUnlocked() {
    if (this.accounts.size < this.options.maximumLoadedAccounts) return;
    const candidate = [...this.accounts.values()]
      .filter(
        (account) =>
          account.activeSockets === 0 && account.activeOperations === 0,
      )
      .sort(
        (left, right) =>
          left.lastUsedAtTimestampMillis - right.lastUsedAtTimestampMillis,
      )[0];
    if (!candidate) {
      this.capacityRejections++;
      throw new RepoPoolCapacityError("All account Repo slots are active");
    }
    await this.shutdownAccountUnlocked(candidate);
  }

  private scheduleIdleShutdown(account: AccountRepoHost) {
    if (account.idleTimer) clearTimeout(account.idleTimer);
    account.idleTimer = setTimeout(() => {
      void this.shutdownAccount(account).catch(() => undefined);
    }, this.options.idleRepoTimeoutMillis);
    account.idleTimer.unref?.();
  }

  private async shutdownAccount(account: AccountRepoHost, force = false) {
    return this.exclusiveLifecycle(() =>
      this.shutdownAccountUnlocked(account, force),
    );
  }

  private async shutdownAccountUnlocked(
    account: AccountRepoHost,
    force = false,
  ) {
    if (this.accounts.get(account.accountID) !== account) return;
    if (!force && (account.activeSockets > 0 || account.activeOperations > 0))
      return;
    if (account.idleTimer) clearTimeout(account.idleTimer);
    account.idleTimer = null;
    if (force) {
      for (const socket of account.socketServer.clients) socket.terminate();
      account.socketServer.clients.clear();
    }
    const documentIDs = Object.keys(account.repo.handles) as DocumentId[];
    // Idle eviction must retain a Repo whose save failed, so it can retry.
    if (!force && documentIDs.length > 0) await account.repo.flush(documentIDs);
    try {
      if (force && documentIDs.length > 0)
        await account.repo.flush(documentIDs);
    } finally {
      // Explicit shutdown must still release sockets and Repo resources when
      // disk/quota failure rejects flush; the original save error propagates.
      try {
        try {
          await (await account.vault?.repository)?.close();
        } finally {
          await account.repo.shutdown();
        }
      } finally {
        for (const socket of account.socketServer.clients) socket.terminate();
        account.socketServer.clients.clear();
        account.socketServer.close();
        this.accounts.delete(account.accountID);
        this.repoShutdowns++;
      }
    }
  }

  private exclusiveLifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleOperation.then(operation, operation);
    this.lifecycleOperation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class ReadyWebSocketServerAdapter extends WebSocketServerAdapter {
  private resolveListening!: () => void;
  private readonly listening = new Promise<void>((resolve) => {
    this.resolveListening = resolve;
  });

  override connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
    super.connect(peerId, peerMetadata);
    this.resolveListening();
  }

  whenListening() {
    return this.listening;
  }
}

function sum<T>(values: readonly T[], select: (value: T) => number) {
  return values.reduce((total, value) => total + select(value), 0);
}
