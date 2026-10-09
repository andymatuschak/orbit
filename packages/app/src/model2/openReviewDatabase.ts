import OrbitAPIClient from "@withorbit/api-client";
import {
  type AttachmentID,
  type ReviewItem,
  type VaultMutation,
} from "@withorbit/core";
import type { AuthenticationClient } from "../authentication/index.js";
import serviceConfig from "../../serviceConfig.js";
import { isHostedSyncAccountEligible } from "../sync/hostedSyncCohort.js";
import type { VaultRegistryManager } from "../vault/vaultRegistry.js";
import { defaultVaultRegistryManager } from "../vault/vaultRegistryStorage.js";
import { LegacyReviewDatabase } from "./LegacyReviewDatabase.js";

export interface ReviewDatabase {
  fetchReviewQueue(): Promise<ReviewItem[]>;
  subscribeToReviewQueue(
    listener: (reviewItems: ReviewItem[]) => void,
  ): () => void;
  close(): Promise<void>;
  apply(mutations: readonly VaultMutation[]): Promise<void>;
  getURLForAttachmentID(attachmentID: AttachmentID): Promise<string | null>;
}

export interface OpenReviewDatabaseOptions {
  authenticationClient?: AuthenticationClient;
  allowCachedBeforeAuth?: boolean;
  hostedSyncEnabled?: boolean;
  hostedSyncServiceOrigin?: string;
  registryManager?: VaultRegistryManager;
}

/** Selects the existing backend; the returned database owns its own lifecycle. */
export async function openReviewDatabase(
  apiClient: OrbitAPIClient,
  accountID: string,
  options: OpenReviewDatabaseOptions = {},
): Promise<ReviewDatabase> {
  const configuredAuthenticationUserIDs =
    serviceConfig.hostedSyncAuthenticationUserIDs;
  const isInHostedSyncCohort = isHostedSyncAccountEligible(
    accountID,
    configuredAuthenticationUserIDs,
  );
  if (
    (options.hostedSyncEnabled ?? serviceConfig.hostedSyncEnabled) &&
    isInHostedSyncCohort &&
    options.authenticationClient
  ) {
    const { tryOpenHostedReviewDatabase } =
      await import("../vault/createRepo.js");
    const hosted = await tryOpenHostedReviewDatabase({
      accountID,
      authenticationClient: options.authenticationClient,
      allowCachedBeforeAuth: options.allowCachedBeforeAuth,
      registry: options.registryManager ?? defaultVaultRegistryManager,
      serviceOrigin:
        options.hostedSyncServiceOrigin ??
        serviceConfig.hostedSyncServiceOrigin,
    });
    if (hosted) return hosted;
  }
  return LegacyReviewDatabase.open(apiClient, accountID);
}
