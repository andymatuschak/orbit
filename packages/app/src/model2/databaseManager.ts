import OrbitAPIClient from "@withorbit/api-client";
import {
  AttachmentID,
  createReviewQueue,
  EntityType,
  Event,
  getReviewQueueFuzzyDueTimestampThreshold,
  ReviewItem,
  Task,
} from "@withorbit/core";
import { OrbitStore } from "@withorbit/store-shared";
import { APISyncAdapter, syncOrbitStore } from "@withorbit/sync";
import { createDefaultOrbitStore } from "./orbitStoreFactory.js";

export class DatabaseManager {
  private readonly _storePromise: Promise<OrbitStore>;

  private readonly _apiClient: OrbitAPIClient;
  private readonly _apiSyncAdapter: APISyncAdapter;
  private _syncPromise: Promise<void> | null = null;

  constructor(apiClient: OrbitAPIClient) {
    this._apiClient = apiClient;
    this._storePromise = createDefaultOrbitStore(); // TODO: namespace the store by user ID
    this._apiSyncAdapter = new APISyncAdapter(this._apiClient, "server");

    this._startSync();
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
    // TODO: implement an approach more resilient to network failures... probably sync status should be separately exported and displayed.
    await this._syncPromise;

    const store = await this._storePromise;
    const thresholdTimestampMillis = getReviewQueueFuzzyDueTimestampThreshold();

    const dueTasks = await store.database.listEntities<Task>({
      entityType: EntityType.Task,
      limit: 500,
      predicate: ["dueTimestampMillis", "<=", thresholdTimestampMillis],
    });
    return createReviewQueue(dueTasks);
  }

  async close(): Promise<void> {
    // TODO: cancel sync... which requires implementing cancellation in @withorbit/sync...

    const store = await this._storePromise;
    await store.database.close();
  }

  async recordEvents(events: Event[]): Promise<void> {
    const store = await this._storePromise;
    await store.database.putEvents(events);

    this._startSync();
  }

  async getURLForAttachmentID(
    attachmentID: AttachmentID,
  ): Promise<string | null> {
    const store = await this._storePromise;
    return store.attachmentStore.getURLForStoredAttachment(attachmentID);
  }

  private _startSync() {
    // TODO: instead of just dropping the request, debounce and enqueue
    if (this._syncPromise === null) {
      console.info("[Sync] Starting...");
      this._syncPromise = this._storePromise.then((store) =>
        syncOrbitStore({ source: store, destination: this._apiSyncAdapter })
          .then(() => {
            console.info("[Sync] Sync completed.");
          })
          .catch((error) => {
            console.error("[Sync] Sync failed: ", error);
          })
          .finally(() => {
            this._syncPromise = null;
          }),
      );
    }
  }
}
