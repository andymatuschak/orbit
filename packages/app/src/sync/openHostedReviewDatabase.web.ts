import type { StorageAdapterInterface } from "@automerge/automerge-repo";
import type { HostedSyncCredential } from "@withorbit/api";
import { HostedReviewDatabase } from "./HostedReviewDatabase.js";
import {
  openBoundHostedVault,
  type HostedVaultBootstrapResult,
  type HostedVaultNetworkAdapter,
} from "./HostedVaultBootstrap.js";
import type { LabConnection } from "../vault/labConnection.js";

export interface HostedReviewDatabaseDependencies {
  openRepoStorage?: (localStoreID: string) => Promise<StorageAdapterInterface>;
  createNetwork?: (input: {
    websocketURL: string;
    requestCredential: () => Promise<HostedSyncCredential>;
  }) => HostedVaultNetworkAdapter;
  runOpenBound?: typeof openBoundHostedVault;
  networkReadyTimeoutMillis?: number;
}

export async function openLabReviewDatabase(
  connection: LabConnection,
  dependencies: HostedReviewDatabaseDependencies = {},
): Promise<HostedReviewDatabase> {
  const result = await (dependencies.runOpenBound ?? openBoundHostedVault)({
    entry: connection,
    requestCredential: async () => ({
      kind: "pairedToken",
      token: connection.token,
    }),
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
