import {
  NetworkAdapter,
  Repo,
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
  RepoAutomergeBinaryStorage,
  RepoPerTaskDocuments,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { afterEach, describe, expect, test } from "bun:test";
import {
  MemoryVaultRegistryStorage,
  VaultRegistryManager,
} from "../vault/vaultRegistry.js";
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
  test("opens an existing local account binding", async () => {
    const repoStorage = new MemoryRepoStorage();
    const remote = await createPerTaskRepoVault(repoStorage, "remote-vault");
    await remote.vault.close();
    await remote.repo.shutdown();
    repos.splice(repos.indexOf(remote.repo), 1);

    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const entry = await registry.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-a",
      accountID: "account-a",
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
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const entry = await registry.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-a",
      accountID: "account-a",
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
    expect((await registry.getRegistry()).hostedVaults).toEqual([entry]);
  });

  test("opens a schema-2 account root without hydrating unrelated tasks", async () => {
    const repoStorage = new MemoryRepoStorage();
    const seeded = await createPerTaskRepoVault(repoStorage);
    await seeded.vault.close();
    await seeded.repo.shutdown();
    repos.splice(repos.indexOf(seeded.repo), 1);
    const registry = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const entry = await registry.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-a",
      accountID: "account-a",
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
  const storage = new RepoAutomergeBinaryStorage(repo);
  const vault = await PerTaskRepository.create(new RepoPerTaskDocuments(repo), {
    vaultID: vaultID as VaultID,
    createdAtTimestampMillis: 1_000,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks: {},
    observations: {},
    attachments: {},
  });
  return { repo, storage, vault };
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
    kind: "firebaseIDToken",
    token: "firebase-token",
  });
}
