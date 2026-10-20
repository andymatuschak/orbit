import type {
  AttachmentID,
  ReviewItem,
  TaskID,
  VaultMutation,
} from "@withorbit/core";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { ReviewDatabase } from "../model2/openReviewDatabase.js";
import type { WidgetProjectionCoordinator } from "../vault/WidgetProjectionCoordinator.js";

type HostedReviewVault = Pick<
  PerTaskRepository,
  | "scheduler"
  | "getReviewQueue"
  | "getTaskProjections"
  | "subscribe"
  | "apply"
  | "readAttachment"
  | "close"
>;
type Attachment = NonNullable<
  Awaited<ReturnType<HostedReviewVault["readAttachment"]>>
>;

/** One client review facade; only attachment URLs and WidgetKit are platform-specific. */
export class HostedReviewDatabase implements ReviewDatabase {
  private readonly openedAt = Date.now();
  private closed = false;
  private closeOperation: Promise<void> | undefined;
  private revision = 0;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readOperation: Promise<ReviewItem[]> | undefined;
  private lastRead: { revision: number; items: ReviewItem[] } | undefined;
  private refreshOperation: Promise<void> = Promise.resolve();
  private writeOperation: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(items: ReviewItem[]) => void>();
  private readonly attachmentURLs = new Map<AttachmentID, string>();
  private readonly attachmentOperations = new Map<
    AttachmentID,
    Promise<string | null>
  >();
  private readonly unsubscribe: () => void;
  private readonly unsubscribeForeground: () => void;

  constructor(
    private readonly vault: HostedReviewVault,
    private readonly platform: {
      attachmentURL(attachment: Attachment): Promise<string>;
      releaseAttachmentURLs(urls: Iterable<string>): Promise<void> | void;
      shutdownRepo?: () => Promise<void>;
      widget?: WidgetProjectionCoordinator;
      finishInBackground?: (operation: () => Promise<void>) => Promise<void>;
      subscribeToForeground?: (listener: () => void) => () => void;
      debounceMillis?: number;
      onError?: (error: unknown) => void;
    },
  ) {
    this.unsubscribe = vault.subscribe(() => {
      if (this.closed) return;
      this.revision++;
      this.dirty = true;
      this.scheduleRefresh();
    });
    this.unsubscribeForeground =
      platform.subscribeToForeground?.(() => {
        void this.importWidgetReviews();
      }) ?? (() => {});
  }

  fetchReviewQueue(): Promise<ReviewItem[]> {
    this.assertOpen();
    if (this.readOperation) return this.readOperation;
    const operation = (async () => {
      let items: ReviewItem[];
      let revision: number;
      do {
        revision = this.revision;
        items = await this.vault.getReviewQueue();
        // A merge during a read invalidates that result. Both explicit fetches
        // and notifications wait for the same fresh projection.
      } while (!this.closed && revision !== this.revision);
      if (!this.closed) {
        this.lastRead = { revision, items };
        // Initial reads stay fast; commits and pushed queues flush separately.
        void this.platform.widget?.publishLatest(items);
      }
      console.log(
        "[Performance] Projected authoritative review queue",
        Date.now() - this.openedAt,
        "ms after database open",
      );
      return items;
    })();
    this.readOperation = operation;
    const clear = () => {
      if (this.readOperation === operation) this.readOperation = undefined;
    };
    void operation.then(clear, clear);
    return operation;
  }

  get scheduler() {
    return this.vault.scheduler;
  }

  getTaskProjections(taskIDs: readonly TaskID[]) {
    this.assertOpen();
    return this.vault.getTaskProjections(taskIDs);
  }

  subscribeToReviewQueue(listener: (items: ReviewItem[]) => void): () => void {
    this.assertOpen();
    this.listeners.add(listener);
    if (this.dirty) this.scheduleRefresh();
    return () => this.listeners.delete(listener);
  }

  apply(mutations: readonly VaultMutation[]): Promise<void> {
    this.assertOpen();
    // Reserve action order before requesting an asynchronous native allowance.
    // Independent grants must not reorder e.g. delete followed by restore.
    const previous = this.writeOperation;
    const persist = async () => {
      await previous;
      await this.persist(mutations);
    };
    const write = this.platform.finishInBackground
      ? this.platform.finishInBackground(persist)
      : persist();
    // Reject to the caller, but let later actions/retries use this lane.
    this.writeOperation = Promise.allSettled([previous, write]).then(() => {});
    return write;
  }

  private async persist(mutations: readonly VaultMutation[]): Promise<void> {
    const started = performance.now();
    await this.vault.apply(mutations);
    const persisted = performance.now();
    if (this.platform.widget && mutations.length) {
      // UI advances optimistically. Keep the handoff within the native
      // background allowance, not a timer iOS can pause on the Home Screen.
      // A failed disposable projection must not reject an already-saved review.
      try {
        let items: ReviewItem[];
        let revision: number;
        do {
          revision = this.revision;
          items = await this.vault.getReviewQueue(undefined, undefined, {
            localOnly: true,
          });
        } while (!this.closed && revision !== this.revision);
        await this.platform.widget.publishLatest(items);
      } catch (error) {
        this.reportError(error);
      }
    }
    console.log("[Performance] Review write", {
      persistenceMillis: Math.round(persisted - started),
      widgetMillis: Math.round(performance.now() - persisted),
    });
  }

  getURLForAttachmentID(attachmentID: AttachmentID): Promise<string | null> {
    this.assertOpen();
    const pending = this.attachmentOperations.get(attachmentID);
    if (pending) return pending;
    const operation = (async () => {
      const existing = this.attachmentURLs.get(attachmentID);
      if (existing) return existing;
      const attachment = await this.vault.readAttachment(attachmentID);
      if (!attachment) return null;
      const url = await this.platform.attachmentURL(attachment);
      this.attachmentURLs.set(attachmentID, url);
      return url;
    })();
    this.attachmentOperations.set(attachmentID, operation);
    const clear = () => this.attachmentOperations.delete(attachmentID);
    void operation.then(clear, clear);
    return operation;
  }

  close(): Promise<void> {
    if (this.closeOperation) return this.closeOperation;
    this.closed = true;
    this.unsubscribe();
    this.unsubscribeForeground();
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.listeners.clear();
    this.closeOperation = (async () => {
      // UI can leave while a write is pending. Do not close its Repo or widget
      // coordinator until the accepted mutation and handoff have finished.
      await this.writeOperation;
      await Promise.allSettled([
        this.refreshOperation,
        this.readOperation,
        this.platform.widget?.close(),
      ]);
      await Promise.allSettled(this.attachmentOperations.values());
      try {
        await this.platform.releaseAttachmentURLs(
          new Set(this.attachmentURLs.values()),
        );
      } finally {
        this.attachmentURLs.clear();
        try {
          await this.vault.close();
        } finally {
          await this.platform.shutdownRepo?.();
        }
      }
    })();
    return this.closeOperation;
  }

  private scheduleRefresh(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.refreshOperation = this.refreshOperation
        .then(async () => {
          if (
            this.closed ||
            !this.dirty ||
            (this.listeners.size === 0 && !this.platform.widget)
          )
            return;
          const items =
            this.lastRead?.revision === this.revision
              ? this.lastRead.items
              : await this.fetchReviewQueue();
          const revision =
            this.lastRead?.items === items ? this.lastRead.revision : undefined;
          // Pushed queues can advance the card too, independently of apply.
          // Never expose a newer native queue before its local widget handoff.
          await this.platform.widget?.flush();
          if (this.closed) return;
          if (revision !== this.revision) {
            this.scheduleRefresh();
            return;
          }
          // Widget-only publication must not consume a change before the UI
          // subscribes; that later notification can reuse this fresh read.
          this.dirty = this.listeners.size === 0;
          this.notify(items);
        })
        .catch((error) => this.reportError(error));
    }, this.platform.debounceMillis ?? 50);
  }

  private notify(items: ReviewItem[]): void {
    if (!this.closed) for (const listener of this.listeners) listener(items);
  }

  private async importWidgetReviews(): Promise<void> {
    if (this.closed || !this.platform.widget) return;
    try {
      const imported = await this.platform.widget.importPendingReviews(
        async (mutations) => {
          await this.vault.apply(mutations);
        },
        () =>
          this.vault.getReviewQueue(undefined, undefined, { localOnly: true }),
      );
      if (imported && !this.closed) {
        // A cached-only handoff may be incomplete. Let the ordinary read
        // refresh the UI rather than announce a false "caught up" state.
        this.dirty = true;
        this.scheduleRefresh();
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  private reportError(error: unknown): void {
    if (this.platform.onError) this.platform.onError(error);
    else console.error("Could not reconcile the hosted review queue", error);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("Hosted review database is closed");
  }
}
