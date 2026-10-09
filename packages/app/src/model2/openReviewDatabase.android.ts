import OrbitAPIClient from "@withorbit/api-client";
import {
  createReviewQueue,
  EntityType,
  getReviewQueueFuzzyDueTimestampThreshold,
  type AttachmentID,
  type ReviewItem,
  type Task,
  type VaultMutation,
} from "@withorbit/core";
import type { OrbitStore } from "@withorbit/store-shared";
import { APISyncAdapter, syncOrbitStore } from "@withorbit/sync";
import { createDefaultOrbitStore } from "./orbitStoreFactory.js";
import { legacyEventsForMutations } from "./legacyMutationAdapter.js";

/**
 * Android retains the pre-Phase-1 legacy facade until an Android-native
 * Automerge runtime is selected. The Apple implementation must not turn that
 * explicit preproduction decision into an Android runtime regression.
 */
export function openReviewDatabase(
  apiClient: OrbitAPIClient,
  accountID: string,
) {
  return AndroidReviewDatabase.open(apiClient, accountID);
}

class AndroidReviewDatabase {
  private syncPromise: Promise<void> | null = null;

  private constructor(
    private readonly store: OrbitStore,
    private readonly apiSyncAdapter: APISyncAdapter,
  ) {
    this.startSync();
  }

  static async open(
    apiClient: OrbitAPIClient,
    _accountID: string,
  ): Promise<AndroidReviewDatabase> {
    return new AndroidReviewDatabase(
      await createDefaultOrbitStore(),
      new APISyncAdapter(apiClient, "server"),
    );
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
    await this.syncPromise;
    const dueTasks = await this.store.database.listEntities<Task>({
      entityType: EntityType.Task,
      limit: 500,
      predicate: [
        "dueTimestampMillis",
        "<=",
        getReviewQueueFuzzyDueTimestampThreshold(),
      ],
    });
    return createReviewQueue(dueTasks);
  }

  async apply(mutations: readonly VaultMutation[]): Promise<void> {
    await this.store.database.putEvents(legacyEventsForMutations(mutations));
    this.startSync();
  }

  getURLForAttachmentID(attachmentID: AttachmentID): Promise<string | null> {
    return this.store.attachmentStore.getURLForStoredAttachment(attachmentID);
  }

  async close(): Promise<void> {
    await this.syncPromise;
    await this.store.database.close();
  }

  private startSync() {
    if (this.syncPromise !== null) return;
    console.info("[Sync] Starting...");
    this.syncPromise = syncOrbitStore({
      source: this.store,
      destination: this.apiSyncAdapter,
    })
      .then(() => console.info("[Sync] Sync completed."))
      .catch(() => console.error("[Sync] Sync failed."))
      .finally(() => {
        this.syncPromise = null;
      });
  }
}
