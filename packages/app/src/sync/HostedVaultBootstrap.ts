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
import {
  CatalogUnavailableError,
  PerTaskRepository,
} from "@withorbit/store-shared/perTaskRepository";
import type { LabConnection } from "../vault/labConnection.js";
import { AuthenticatedWebSocketNetworkAdapter } from "./AuthenticatedWebSocketNetworkAdapter.js";
import { hostedSyncWebSocketURL } from "./HostedVaultClient.js";

export interface HostedVaultBootstrapResult {
  vault: PerTaskRepository;
  repo: Repo;
}

export interface HostedVaultNetworkAdapter extends NetworkAdapterInterface {
  whenReady(): Promise<void>;
}

/** Opens the paired private root; network availability does not veto a local cache. */
export async function openBoundHostedVault(input: {
  entry: LabConnection;
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
  let vault: PerTaskRepository | undefined;
  try {
    const network = attachHostedNetwork({
      repo,
      serviceOrigin: input.entry.serviceOrigin,
      requestCredential: input.requestCredential,
      createNetwork: input.createNetwork,
    });
    const documents = new RepoPerTaskDocuments(repo);
    const cachedRoot = await documents.read(input.entry.rootDocumentURL, {
      localOnly: true,
    });
    if (!cachedRoot) {
      await waitForNetworkReady(network, input.networkReadyTimeoutMillis);
      vault = await PerTaskRepository.open(
        documents,
        input.entry.rootDocumentURL,
      );
    } else {
      try {
        vault = await PerTaskRepository.open(
          documents,
          input.entry.rootDocumentURL,
          cachedRoot,
          { localOnly: true },
        );
      } catch (error) {
        if (!(error instanceof CatalogUnavailableError)) throw error;
        await waitForNetworkReady(network, input.networkReadyTimeoutMillis);
        vault = await PerTaskRepository.open(
          documents,
          input.entry.rootDocumentURL,
        );
      }
    }
    const workingSet = (await vault.getCoreDocumentURLs()).slice(2);
    const localTasks = await Promise.all(
      workingSet.map((url) => documents.read(url, { localOnly: true })),
    );
    const missing = workingSet.filter((_, index) => !localTasks[index]);
    const fetchMissing = async () => {
      const available = await Promise.all(
        missing.map((url) => documents.fetch(url)),
      );
      if (available.some((value) => !value)) {
        throw new Error("The Lab review working set is unavailable.");
      }
    };
    if (workingSet.length > 0 && !localTasks.some(Boolean)) {
      // A known catalog with no cached prompts is unavailable, not an empty queue.
      await waitForNetworkReady(network, input.networkReadyTimeoutMillis);
      await fetchMissing();
    } else {
      // A partial local queue remains useful offline; replenish it asynchronously.
      void fetchMissing().catch(() => undefined);
    }
    return {
      vault,
      repo,
    };
  } catch (error) {
    await vault?.close();
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
        `com.withorbit.lab.automerge.${localStoreID}`,
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
