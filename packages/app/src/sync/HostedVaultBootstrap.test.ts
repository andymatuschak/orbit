import {
  NetworkAdapter,
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
  type Message,
  type PeerId,
  type PeerMetadata,
  type StorageAdapterInterface,
  type StorageKey,
} from "@automerge/automerge-repo/slim";
import type { HostedSyncCredential } from "@withorbit/api";
import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
  type ObservationID,
  type ReviewItem,
  type TaskID,
  type VaultID,
  type VaultMutationID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  RepoPerTaskDocuments,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { afterEach, describe, expect, test } from "bun:test";
import {
  MemoryLabConnectionStorage,
  LabConnectionManager,
} from "../vault/labConnection.js";
import {
  openBoundHostedVault,
  type HostedVaultNetworkAdapter,
} from "./HostedVaultBootstrap.js";
import { openWebHostedReviewDatabase } from "./openHostedReviewDatabase.web.js";

const repos: Repo[] = [];

afterEach(async () => {
  await Promise.allSettled(repos.splice(0).map((repo) => repo.shutdown()));
});

describe("hosted vault bootstrap", () => {
  test("cold reopening uploads an offline review outside the first 50 through ordinary Repo sync", async () => {
    const serverStorage = new MemoryRepoStorage();
    let server = await createPerTaskRepoVault(serverStorage);
    const taskIDs = Array.from(
      { length: 53 },
      (_, index) => `cache-replay-${index}` as TaskID,
    );
    await server.vault.apply(
      taskIDs.map((taskID, index) => ({
        kind: "ingestTask" as const,
        mutationID: `ingest-${taskID}` as VaultMutationID,
        task: {
          taskID,
          createdAtTimestampMillis: 1_000 + index,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.Plain,
              body: { text: `Cached replay prompt ${index}`, attachments: [] },
            },
          },
          provenance: null,
          metadata: {},
        },
      })),
    );
    await server.repo.flush();
    const clientStorage = new MemoryRepoStorage();
    for (const { key, data } of await serverStorage.loadRange([]))
      await clientStorage.save(key, data);
    await server.vault.close();
    await server.repo.shutdown();
    repos.splice(repos.indexOf(server.repo), 1);
    const coldRepo = createRepo(serverStorage, "cold-peer");
    server = {
      repo: coldRepo,
      vault: await PerTaskRepository.open(
        new RepoPerTaskDocuments(coldRepo),
        server.vault.rootURL,
      ),
    };
    const inspection = await PerTaskRepository.open(
      new BinaryPerTaskDocuments({
        async load(url) {
          return (
            (await server.repo.storageSubsystem!.loadDocData(
              parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
            )) ?? undefined
          );
        },
        async save() {
          throw new Error("independent peer inspection is read-only");
        },
      }),
      server.vault.rootURL,
    );
    const entry = await new LabConnectionManager(
      new MemoryLabConnectionStorage(),
    ).pair({
      token: "paired-key",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: server.vault.rootURL,
    });
    const offline = await openBoundHostedVault({
      entry,
      requestCredential,
      openRepoStorage: async () => clientStorage,
      createNetwork: () => new NeverReadyNetworkAdapter(),
    });
    const observationID = "offline-outside-working-set" as ObservationID;
    const taskURL = (await offline.vault.getCatalogEntries())[taskIDs[0]]
      .documentURL;
    await offline.vault.apply([
      {
        kind: "recordReview",
        mutationID: observationID as unknown as VaultMutationID,
        observationID,
        taskID: taskIDs[0],
        componentID: "main",
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: Date.now(),
      },
    ]);
    expect(await offline.vault.getReviewWorkingSetDocumentURLs()).not.toContain(
      taskURL,
    );
    await offline.vault.close();
    await offline.repo.shutdown();
    expect(
      await inspection.readTaskObservation(taskIDs[0], observationID),
    ).toBeNull();

    const clientNetwork = new PairedNetworkAdapter();
    const serverNetwork = new PairedNetworkAdapter();
    clientNetwork.partner = serverNetwork;
    serverNetwork.partner = clientNetwork;
    server.repo.networkSubsystem.addNetworkAdapter(serverNetwork);
    const reopened = await openBoundHostedVault({
      entry,
      requestCredential,
      openRepoStorage: async () => clientStorage,
      createNetwork: () => clientNetwork,
    });
    repos.push(reopened.repo);
    try {
      // The ordinary initial queue did not open the reviewed task. The shared
      // background pass, not a manual reread of that task, must publish it.
      expect(
        reopened.repo.handles[
          parseAutomergeUrl(taskURL as unknown as AutomergeUrl).documentId
        ],
      ).toBeUndefined();
      await eventually(
        async () =>
          (await inspection.readTaskObservation(taskIDs[0], observationID)) !==
          null,
      );
      expect(
        await inspection.readTaskObservation(taskIDs[0], observationID),
      ).toMatchObject({
        kind: "review",
        outcome: TaskRepetitionOutcome.Remembered,
      });
    } finally {
      await reopened.vault.close();
      await server.vault.close();
      await inspection.close();
    }
  });

  test("cached web prompts can be reviewed and reopened while the laptop is unreachable", async () => {
    const repoStorage = new MemoryRepoStorage();
    const seeded = await createPerTaskRepoVault(repoStorage);
    const taskID = "offline-web-task" as TaskID;
    await seeded.vault.apply([
      {
        kind: "ingestTask",
        mutationID: "ingest-offline-web-task" as VaultMutationID,
        task: {
          taskID,
          createdAtTimestampMillis: 1_000,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.Plain,
              body: { text: "Cached offline prompt", attachments: [] },
            },
          },
          provenance: null,
          metadata: {},
        },
      },
    ]);
    const rootDocumentURL = seeded.vault.rootURL;
    await seeded.vault.close();
    await seeded.repo.shutdown();
    repos.splice(repos.indexOf(seeded.repo), 1);
    const connection = await new LabConnectionManager(
      new MemoryLabConnectionStorage(),
    ).pair({
      serviceOrigin: "https://laptop.example.test",
      token: "paired-key",
      rootDocumentURL,
    });
    const openOffline = () =>
      openBoundHostedVault({
        entry: connection,
        requestCredential,
        openRepoStorage: async () => repoStorage,
        createNetwork: () => new NeverReadyNetworkAdapter(),
        networkReadyTimeoutMillis: 1,
      });
    const first = await openOffline();
    repos.push(first.repo);
    const database = openWebHostedReviewDatabase(first);
    expect(
      (await database.fetchReviewQueue()).map((item) => item.task.id),
    ).toEqual([taskID]);
    await database.apply([
      {
        kind: "recordReview",
        mutationID: "review-offline-web-task" as VaultMutationID,
        observationID: "review-offline-web-task" as ObservationID,
        taskID,
        componentID: "main",
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: Date.now(),
      },
    ]);
    await database.close();
    repos.splice(repos.indexOf(first.repo), 1);
    const reopened = await openOffline();
    repos.push(reopened.repo);
    expect(await reopened.vault.getReviewQueue()).toEqual([]);
    expect(
      await reopened.vault.readTaskObservation(
        taskID,
        "review-offline-web-task" as ObservationID,
      ),
    ).not.toBeNull();
  });

  test("opens an existing local account binding", async () => {
    const repoStorage = new MemoryRepoStorage();
    const remote = await createPerTaskRepoVault(repoStorage, "remote-vault");
    await remote.vault.close();
    await remote.repo.shutdown();
    repos.splice(repos.indexOf(remote.repo), 1);

    const registry = new LabConnectionManager(new MemoryLabConnectionStorage());
    const entry = await registry.pair({
      token: "paired-token",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: remote.vault.rootURL,
    });
    const result = await openBoundHostedVault({
      entry,
      requestCredential,
      openRepoStorage: async () => repoStorage,
      createNetwork: () => new ReadyNetworkAdapter(),
    });
    repos.push(result.repo);

    expect(result.vault.vaultID).toBe("remote-vault" as VaultID);
    expect((await result.vault.getProjection()).tasks.size).toBe(0);
  });

  test("a connection failure keeps the hosted cache coordinates intact", async () => {
    const seeded = await createPerTaskRepoVault(new MemoryRepoStorage());
    const registry = new LabConnectionManager(new MemoryLabConnectionStorage());
    const entry = await registry.pair({
      token: "paired-token",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: seeded.vault.rootURL,
    });
    await expect(
      openBoundHostedVault({
        entry,
        requestCredential,
        openRepoStorage: async () => new MemoryRepoStorage(),
        createNetwork: () => new NeverReadyNetworkAdapter(),
        networkReadyTimeoutMillis: 1,
      }),
    ).rejects.toThrow("Timed out connecting to Orbit Sync");
    expect(await registry.load()).toEqual(entry);
  });

  test("a cached catalog with no local prompts is unavailable, not an empty queue", async () => {
    const repoStorage = new MemoryRepoStorage();
    const seeded = await createPerTaskRepoVault(repoStorage);
    await seeded.vault.apply([
      {
        kind: "ingestTask",
        mutationID: "missing-web-task" as VaultMutationID,
        task: {
          taskID: "missing-web-task" as TaskID,
          createdAtTimestampMillis: 1_000,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.Plain,
              body: { text: "Not cached", attachments: [] },
            },
          },
          provenance: null,
          metadata: {},
        },
      },
    ]);
    const rootDocumentURL = seeded.vault.rootURL;
    const [, , taskURL] = await seeded.vault.getReviewWorkingSetDocumentURLs();
    await seeded.vault.close();
    await seeded.repo.shutdown();
    repos.splice(repos.indexOf(seeded.repo), 1);
    const { documentId } = parseAutomergeUrl(
      taskURL as unknown as AutomergeUrl,
    );
    await repoStorage.removeRange([documentId]);
    const entry = await new LabConnectionManager(
      new MemoryLabConnectionStorage(),
    ).pair({
      serviceOrigin: "https://laptop.example.test",
      token: "key",
      rootDocumentURL,
    });
    await expect(
      openBoundHostedVault({
        entry,
        requestCredential,
        openRepoStorage: async () => repoStorage,
        createNetwork: () => new NeverReadyNetworkAdapter(),
        networkReadyTimeoutMillis: 1,
      }),
    ).rejects.toThrow("Timed out connecting");
  });

  test("opens a schema-2 account root without hydrating unrelated tasks", async () => {
    const repoStorage = new MemoryRepoStorage();
    const seeded = await createPerTaskRepoVault(repoStorage);
    await seeded.vault.close();
    await seeded.repo.shutdown();
    repos.splice(repos.indexOf(seeded.repo), 1);
    const registry = new LabConnectionManager(new MemoryLabConnectionStorage());
    const entry = await registry.pair({
      token: "paired-token",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: seeded.vault.rootURL,
    });

    const result = await openBoundHostedVault({
      entry,
      requestCredential,
      openRepoStorage: async () => repoStorage,
      createNetwork: () => new ReadyNetworkAdapter(),
    });
    repos.push(result.repo);

    expect(result.vault.vaultID).toBe("schema-2-vault" as VaultID);
    expect(await result.vault.getReviewQueue()).toHaveLength(0);
  });

  test("updates an open web queue after another vault instance reviews a task", async () => {
    const seeded = await createPerTaskRepoVault(new MemoryRepoStorage());
    const taskID = "web-review-task" as TaskID;
    await seeded.vault.apply([
      {
        kind: "ingestTask",
        mutationID: "ingest-web-review-task" as VaultMutationID,
        task: {
          taskID,
          createdAtTimestampMillis: 1_000,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.Plain,
              body: { text: "Web review prompt", attachments: [] },
            },
          },
          provenance: null,
          metadata: {},
        },
      },
    ]);

    const browserVault = await PerTaskRepository.open(
      new RepoPerTaskDocuments(seeded.repo),
      seeded.vault.rootURL,
    );
    const database = openWebHostedReviewDatabase({
      ...seeded,
      vault: browserVault,
    });
    expect(await database.fetchReviewQueue()).toHaveLength(1);
    const updated = new Promise<ReviewItem[]>((resolve) =>
      database.subscribeToReviewQueue(resolve),
    );

    await seeded.vault.apply([
      {
        kind: "recordReview",
        mutationID: "review-web-task" as VaultMutationID,
        observationID: "review-web-task" as ObservationID,
        taskID,
        componentID: "main",
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: Date.now(),
      },
    ]);
    expect(await updated).toHaveLength(0);
    await database.close();
    repos.splice(repos.indexOf(seeded.repo), 1);
  });
});

async function createPerTaskRepoVault(
  repoStorage: StorageAdapterInterface,
  vaultID = "schema-2-vault",
) {
  const repo = createRepo(repoStorage, "schema-2");
  const vault = await PerTaskRepository.create(new RepoPerTaskDocuments(repo), {
    vaultID: vaultID as VaultID,
    createdAtTimestampMillis: 1_000,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks: {},
    observations: {},
    attachments: {},
  });
  return { repo, vault };
}

class ReadyNetworkAdapter
  extends NetworkAdapter
  implements HostedVaultNetworkAdapter
{
  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
  }
  disconnect(): void {}
  send(_message: Message): void {}
  isReady() {
    return true;
  }
  async whenReady() {}
}

class NeverReadyNetworkAdapter
  extends NetworkAdapter
  implements HostedVaultNetworkAdapter
{
  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
  }
  disconnect(): void {}
  send(_message: Message): void {}
  isReady() {
    return false;
  }
  whenReady() {
    return new Promise<void>(() => undefined);
  }
}

/** Actual Repo protocol, independent durable stores; no socket or service. */
class PairedNetworkAdapter
  extends NetworkAdapter
  implements HostedVaultNetworkAdapter
{
  partner?: PairedNetworkAdapter;
  private connected = false;
  private resolveReady!: () => void;
  private readonly ready = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });
  connect(peerId: PeerId, peerMetadata?: PeerMetadata) {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata;
    const partner = this.partner;
    if (!partner?.peerId) return;
    this.connected = partner.connected = true;
    queueMicrotask(() => {
      this.emit("peer-candidate", {
        peerId: partner.peerId!,
        peerMetadata: partner.peerMetadata ?? {},
      });
      partner.emit("peer-candidate", {
        peerId,
        peerMetadata: peerMetadata ?? {},
      });
      this.resolveReady();
      partner.resolveReady();
    });
  }
  disconnect() {
    this.connected = false;
    if (this.peerId)
      this.partner?.emit("peer-disconnected", { peerId: this.peerId });
  }
  send(message: Message) {
    if (!this.connected) return;
    const copy = structuredClone(message);
    queueMicrotask(() => {
      if (this.connected) this.partner?.emit("message", copy);
    });
  }
  isReady() {
    return this.connected;
  }
  whenReady() {
    return this.ready;
  }
}

class MemoryRepoStorage implements StorageAdapterInterface {
  private readonly values = new Map<string, Uint8Array>();
  async load(key: StorageKey) {
    const value = this.values.get(JSON.stringify(key));
    return value ? new Uint8Array(value) : undefined;
  }
  async save(key: StorageKey, data: Uint8Array) {
    this.values.set(JSON.stringify(key), new Uint8Array(data));
  }
  async remove(key: StorageKey) {
    this.values.delete(JSON.stringify(key));
  }
  async loadRange(prefix: StorageKey) {
    return [...this.values.entries()]
      .map(([encoded, data]) => ({
        key: JSON.parse(encoded) as StorageKey,
        data: new Uint8Array(data),
      }))
      .filter(({ key }) =>
        prefix.every((segment, index) => key[index] === segment),
      );
  }
  async removeRange(prefix: StorageKey) {
    for (const { key } of await this.loadRange(prefix)) {
      this.values.delete(JSON.stringify(key));
    }
  }
}

function createRepo(storage: StorageAdapterInterface, suffix: string) {
  const repo = new Repo({
    peerId: `bootstrap-${suffix}` as PeerId,
    isEphemeral: false,
    storage,
    network: [],
    saveDebounceRate: 0,
  });
  repos.push(repo);
  return repo;
}

function requestCredential(): Promise<HostedSyncCredential> {
  return Promise.resolve({
    kind: "pairedToken",
    token: "paired-token",
  });
}

async function eventually(predicate: () => Promise<boolean>) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("cached offline review did not reach the independent peer");
}
