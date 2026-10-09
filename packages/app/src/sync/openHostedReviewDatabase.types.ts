import type { AuthenticationClient } from "../authentication/index.js";
import type { ReviewDatabase } from "../model2/openReviewDatabase.js";
import type { VaultRegistryManager } from "../vault/vaultRegistry.js";

export interface OpenHostedReviewDatabaseInput {
  accountID: string;
  authenticationClient: AuthenticationClient;
  allowCachedBeforeAuth?: boolean;
  registry: VaultRegistryManager;
  serviceOrigin: string;
}

export type HostedReviewDatabaseResult = ReviewDatabase | null;
