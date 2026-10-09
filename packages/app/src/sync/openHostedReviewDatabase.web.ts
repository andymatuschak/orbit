import type { StorageAdapterInterface } from "@automerge/automerge-repo";
import type { HostedSyncCredential } from "@withorbit/api";
import { HostedReviewDatabase } from "./HostedReviewDatabase.js";
import {
  openBoundHostedVault,
  type HostedVaultBootstrapResult,
  type HostedVaultNetworkAdapter,
} from "./HostedVaultBootstrap.js";
import {
  prepareHostedReviewOpening,
  type HostedReviewControlClient,
} from "./hostedReviewOpening.js";
import type {
  HostedReviewDatabaseResult,
  OpenHostedReviewDatabaseInput,
} from "./openHostedReviewDatabase.types.js";

export interface HostedReviewDatabaseDependencies {
  controlClient?: HostedReviewControlClient;
  openRepoStorage?: (localStoreID: string) => Promise<StorageAdapterInterface>;
  createNetwork?: (input: {
    websocketURL: string;
    requestCredential: () => Promise<HostedSyncCredential>;
  }) => HostedVaultNetworkAdapter;
  runOpenBound?: typeof openBoundHostedVault;
  sleep?: (delayMillis: number) => Promise<void>;
  networkReadyTimeoutMillis?: number;
}

/** Legacy accounts return null so opening keeps its compatibility path. */
export async function tryOpenHostedReviewDatabase(
  input: OpenHostedReviewDatabaseInput,
  dependencies: HostedReviewDatabaseDependencies = {},
): Promise<HostedReviewDatabaseResult> {
  const opening = await prepareHostedReviewOpening(input, {
    controlClient: dependencies.controlClient,
    sleep: dependencies.sleep,
  });
  if (opening.kind === "legacy") return null;
  const result = await (dependencies.runOpenBound ?? openBoundHostedVault)({
    entry: opening.entry,
    requestCredential: () => opening.control.getSyncCredential(),
    openRepoStorage: dependencies.openRepoStorage,
    createNetwork: dependencies.createNetwork,
    networkReadyTimeoutMillis: dependencies.networkReadyTimeoutMillis,
  });
  return openWebHostedReviewDatabase(result);
}

export function openWebHostedReviewDatabase(
  hosted: HostedVaultBootstrapResult,
): HostedReviewDatabase {
  return new HostedReviewDatabase(hosted.vault, {
    async attachmentURL(attachment) {
      const bytes = new Uint8Array(attachment.bytes);
      return URL.createObjectURL(
        new Blob([bytes.buffer], { type: attachment.mediaType }),
      );
    },
    releaseAttachmentURLs(urls) {
      for (const url of urls) URL.revokeObjectURL(url);
    },
    shutdownRepo: () => hosted.repo.shutdown(),
  });
}
