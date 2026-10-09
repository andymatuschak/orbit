import {
  Repo,
  type NetworkAdapterInterface,
  type PeerId,
  type StorageAdapterInterface,
} from "@automerge/automerge-repo";
import type { HostedSyncCredential } from "@withorbit/api";
import { generateUniqueID } from "@withorbit/core";
import {
  IndexedDBRepoStorageAdapter,
  RepoPerTaskDocuments,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { HostedVaultRegistryEntry } from "../vault/vaultRegistry.js";
import { AuthenticatedWebSocketNetworkAdapter } from "./AuthenticatedWebSocketNetworkAdapter.js";
import { hostedSyncWebSocketURL } from "./HostedVaultClient.js";

export interface HostedVaultBootstrapResult {
  vault: PerTaskRepository;
  repo: Repo;
}

export interface HostedVaultNetworkAdapter extends NetworkAdapterInterface {
  whenReady(): Promise<void>;
}

/** Opens an already-associated account root on this device without importing a source vault. */
export async function openBoundHostedVault(input: {
  entry: HostedVaultRegistryEntry;
  requestCredential: () => Promise<HostedSyncCredential>;
  openRepoStorage?: (localStoreID: string) => Promise<StorageAdapterInterface>;
  createNetwork?: (input: {
    websocketURL: string;
    requestCredential: () => Promise<HostedSyncCredential>;
  }) => HostedVaultNetworkAdapter;
  networkReadyTimeoutMillis?: number;
}): Promise<HostedVaultBootstrapResult> {
  const repo = await createLocalRepo(
    input.entry.localStoreID,
    input.openRepoStorage,
  );
  try {
    const network = attachHostedNetwork({
      repo,
      serviceOrigin: input.entry.serviceOrigin,
      requestCredential: input.requestCredential,
      createNetwork: input.createNetwork,
    });
    await waitForNetworkReady(network, input.networkReadyTimeoutMillis);
    const documents = new RepoPerTaskDocuments(repo);
    const vault = await PerTaskRepository.open(
      documents,
      input.entry.rootDocumentURL,
    );
    return {
      vault,
      repo,
    };
  } catch (error) {
    await repo.shutdown();
    throw error;
  }
}

async function createLocalRepo(
  localStoreID: string,
  openRepoStorage:
    ((localStoreID: string) => Promise<StorageAdapterInterface>) | undefined,
) {
  const storage = openRepoStorage
    ? await openRepoStorage(localStoreID)
    : new IndexedDBRepoStorageAdapter(
        `com.withorbit.automerge.${localStoreID}`,
      );
  return new Repo({
    peerId: `orbit-client-${generateUniqueID()}` as PeerId,
    isEphemeral: false,
    storage,
    network: [],
    shareConfig: {
      announce: async () => true,
      access: async () => true,
    },
    flushConcurrency: 6,
    syncStateLoadConcurrency: 6,
    sharePolicyConcurrency: 8,
  });
}

function attachHostedNetwork(input: {
  repo: Repo;
  serviceOrigin: string;
  requestCredential: () => Promise<HostedSyncCredential>;
  createNetwork?: Parameters<typeof openBoundHostedVault>[0]["createNetwork"];
}) {
  const network = (input.createNetwork ?? defaultNetworkFactory)({
    websocketURL: hostedSyncWebSocketURL(input.serviceOrigin),
    requestCredential: input.requestCredential,
  });
  input.repo.networkSubsystem.addNetworkAdapter(network);
  return network;
}

function defaultNetworkFactory(input: {
  websocketURL: string;
  requestCredential: () => Promise<HostedSyncCredential>;
}) {
  return new AuthenticatedWebSocketNetworkAdapter(
    input.websocketURL,
    input.requestCredential,
  );
}

async function waitForNetworkReady(
  network: HostedVaultNetworkAdapter,
  timeoutMillis = 20_000,
) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    await Promise.race([
      network.whenReady(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out connecting to Orbit Sync")),
          timeoutMillis,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
