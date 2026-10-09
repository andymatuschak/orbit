import OrbitAPIClient from "@withorbit/api-client";
import {
  EntityType,
  createReviewQueue,
  getReviewQueueFuzzyDueTimestampThreshold,
  type AttachmentID,
  type ReviewItem,
  type Task,
  type VaultID,
  type VaultMutation,
} from "@withorbit/core";
import type { OrbitStore } from "@withorbit/store-shared";
import { APISyncAdapter, syncOrbitStore } from "@withorbit/sync";
import type { WidgetProjectionBridge } from "../vault/widgetProjection.js";
import { WidgetProjectionCoordinator } from "../vault/WidgetProjectionCoordinator.js";
import { createDefaultOrbitStore } from "./orbitStoreFactory.js";
import { legacyEventsForMutations } from "./legacyMutationAdapter.js";

export interface LegacyReviewDatabaseDependencies {
  createStore?: () => Promise<OrbitStore>;
  syncStore?: (store: OrbitStore) => Promise<void>;
  widgetProjectionBridge?: WidgetProjectionBridge | null;
  onWidgetError?: (error: unknown) => void;
  subscribeToForeground?: (listener: () => void) => () => void;
}

/** The complete, deliberately isolated data path for unmigrated accounts. */
export class LegacyReviewDatabase {
  private syncPromise: Promise<void> | null = null;
  private syncRequestedWhileRunning = false;
  private isClosed = false;
  private widgetImportOperation: Promise<void> = Promise.resolve();
  private readonly unsubscribeForeground: () => void;
  private readonly queueListeners = new Set<(items: ReviewItem[]) => void>();

  private constructor(
    private readonly store: OrbitStore,
    private readonly syncStore: (store: OrbitStore) => Promise<void>,
    private readonly widget: WidgetProjectionCoordinator | null,
    private readonly onWidgetError: (error: unknown) => void,
    subscribeToForeground?: (listener: () => void) => () => void,
  ) {
    this.unsubscribeForeground =
      subscribeToForeground?.(() => {
        void this.importWidgetReviews();
      }) ?? (() => undefined);
  }

  static async open(
    apiClient: OrbitAPIClient,
    accountID: string,
    dependencies: LegacyReviewDatabaseDependencies = {},
  ): Promise<LegacyReviewDatabase> {
    const store = await (dependencies.createStore ?? createDefaultOrbitStore)();
    const vaultID = `legacy/${accountID}` as VaultID;
    const bridge =
      dependencies.widgetProjectionBridge === undefined
        ? (
            await import("../vault/widgetProjectionBridge.js")
          ).getWidgetProjectionBridge()
        : dependencies.widgetProjectionBridge;
    const database = new LegacyReviewDatabase(
      store,
      dependencies.syncStore ??
        (async (source) => {
          await syncOrbitStore({
            source,
            destination: new APISyncAdapter(apiClient, "server"),
          });
        }),
      bridge
        ? new WidgetProjectionCoordinator(
            vaultID,
            bridge,
            dependencies.onWidgetError,
          )
        : null,
      dependencies.onWidgetError ??
        ((error) => console.error("Could not update the review widget", error)),
      dependencies.subscribeToForeground ?? bridge?.subscribeToForeground,
    );
    await database.importWidgetReviews();
    database.startSync();
    void database.publishWidgetProjection();
    return database;
  }

  async fetchReviewQueue(): Promise<ReviewItem[]> {
    this.assertOpen();
    let dueTasks = await this.listDueTasks();
    const initialSync = this.syncPromise;
    if (dueTasks.length === 0 && initialSync !== null) {
      const anyTask = await this.store.database.listEntities<Task>({
        entityType: EntityType.Task,
        limit: 1,
      });
      if (anyTask.length === 0) {
        await initialSync;
        dueTasks = await this.listDueTasks();
      }
    }
    const reviewItems = createReviewQueue(dueTasks);
    // WidgetKit is a disposable projection and must not gate the review UI.
    void this.publishWidgetProjection(reviewItems);
    return reviewItems;
  }

  subscribeToReviewQueue(listener: (items: ReviewItem[]) => void): () => void {
    this.assertOpen();
    this.queueListeners.add(listener);
    return () => this.queueListeners.delete(listener);
  }

  async apply(mutations: readonly VaultMutation[]): Promise<void> {
    this.assertOpen();
    await this.store.database.putEvents(legacyEventsForMutations(mutations));
    // WidgetKit is a disposable derivative. A slow extension handoff must not
    // extend the acknowledgement boundary of the authoritative legacy write.
    void this.publishWidgetProjection();
    this.startSync();
  }

  getURLForAttachmentID(attachmentID: AttachmentID): Promise<string | null> {
    this.assertOpen();
    return this.store.attachmentStore.getURLForStoredAttachment(attachmentID);
  }

  async close(): Promise<void> {
    if (this.isClosed) return;
    this.isClosed = true;
    this.unsubscribeForeground();
    this.queueListeners.clear();
    await this.widgetImportOperation;
    await this.syncPromise;
    await this.widget?.close();
    await this.store.database.close();
  }

  private listDueTasks() {
    return this.store.database.listEntities<Task>({
      entityType: EntityType.Task,
      limit: 500,
      predicate: [
        "dueTimestampMillis",
        "<=",
        getReviewQueueFuzzyDueTimestampThreshold(),
      ],
    });
  }

  private startSync() {
    if (this.isClosed) return;
    if (this.syncPromise !== null) {
      this.syncRequestedWhileRunning = true;
      return;
    }
    this.syncRequestedWhileRunning = false;
    this.syncPromise = this.syncStore(this.store)
      .then(() => this.publishWidgetProjection())
      .catch(() => console.error("[Sync] Sync failed."))
      .finally(() => {
        this.syncPromise = null;
        if (this.syncRequestedWhileRunning) this.startSync();
      });
  }

  private importWidgetReviews(): Promise<void> {
    this.widgetImportOperation = this.widgetImportOperation
      .then(async () => {
        if (!this.widget || this.isClosed) return;
        let freshQueue: ReviewItem[] | undefined;
        const imported = await this.widget.importPendingReviews(
          (mutations) =>
            this.store.database
              .putEvents(legacyEventsForMutations(mutations))
              .then(() => undefined),
          async () =>
            (freshQueue = createReviewQueue(await this.listDueTasks())),
        );
        if (imported > 0 && !this.isClosed) {
          for (const listener of this.queueListeners) listener(freshQueue!);
          this.startSync();
        }
      })
      .catch(this.onWidgetError);
    return this.widgetImportOperation;
  }

  private async publishWidgetProjection(reviewItems?: readonly ReviewItem[]) {
    if (!this.widget || this.isClosed) return;
    await this.widget.publishLatest(
      reviewItems ??
        (async () => {
          return createReviewQueue(await this.listDueTasks());
        }),
    );
  }

  private assertOpen() {
    if (this.isClosed) throw new Error("Legacy review database is closed");
  }
}
