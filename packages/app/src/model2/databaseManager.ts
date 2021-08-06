import OrbitAPIClient from "@withorbit/api-client";
import {
  getActionLogFromPromptActionLog,
  getIDForActionLogSync,
  Prompt,
  PromptActionLog,
  reviewSession,
} from "@withorbit/core";
import { EntityType, Event, migration, Task } from "@withorbit/core2";
import { ReviewItem } from "@withorbit/embedded-support";
import { OrbitStore } from "@withorbit/store-shared";
import { APISyncAdapter, syncOrbitStore } from "@withorbit/sync";
import { backportReviewItem } from "./backportCore2";
import { createOrbitStore } from "./orbitStoreFactory";
import { createReviewQueue } from "./reviewQueue";

// core2 implementation of DatabaseManager intended to be a drop-in replacement for the core1 DatabaseManager.
// TODO: Once ui uses core2 types, migrate the outward-facing API here to core2 types too.
export class DatabaseManager {
  private readonly _apiClient: OrbitAPIClient;
  private readonly _storePromise: Promise<OrbitStore>;
  private readonly _apiSyncAdapter: APISyncAdapter;
  private _syncPromise: Promise<void> | null = null;

  constructor(apiClient: OrbitAPIClient) {
    this._apiClient = apiClient;
    this._storePromise = createOrbitStore("shared.orbitStore"); // TODO: namespace the store by user ID
    this._apiSyncAdapter = new APISyncAdapter(this._apiClient, "server");

    this._startSync();
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
    // TODO: implement an approach more resilient to network failures... probably sync status should be separately exported and displayed.
    await this._syncPromise;

    const store = await this._storePromise;
    const thresholdTimestampMillis =
      reviewSession.getFuzzyDueTimestampThreshold(Date.now()); // TODO migrate to core2

    const dueTasks = await store.database.listEntities<Task>({
      entityType: EntityType.Task,
      limit: 500,
      predicate: ["dueTimestampMillis", "<=", thresholdTimestampMillis],
    });
    const reviewItems = createReviewQueue(dueTasks, thresholdTimestampMillis);
    return await Promise.all(
      reviewItems.map((item) =>
        backportReviewItem(item, store.attachmentStore),
      ),
    );
  }

  async close(): Promise<void> {
    // TODO: cancel sync... which requires implementing cancellation in @withorbit/sync...

    const store = await this._storePromise;
    await store.database.close();
  }

  async recordPromptActionLogs(
    entries: Iterable<PromptActionLog>,
  ): Promise<void> {
    const events: Event[] = [];
    for (const entry of entries) {
      events.push(
        ...migration.convertCore1ActionLog(
          entry,
          getIDForActionLogSync(getActionLogFromPromptActionLog(entry)),
          // HACK: We never ingest new events in the app at the moment, so we don't actually need to provide a prompt. Normally I'd go to great lengths to avoid this kind of entangled assumption, but we're going to be removing this migration shim shortly.
          {} as Prompt,
        ),
      );
    }
    const store = await this._storePromise;
    await store.database.putEvents(events);

    this._startSync();
  }

  private _startSync() {
    // TODO: instead of just dropping the request, debounce and enqueue
    if (this._syncPromise === null) {
      console.info("[Sync] Starting...");
      this._syncPromise = this._storePromise.then((store) =>
        syncOrbitStore(store, this._apiSyncAdapter)
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
