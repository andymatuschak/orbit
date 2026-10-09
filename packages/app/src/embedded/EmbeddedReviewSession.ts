import {
  eventReducer,
  EventType,
  generateUniqueID,
  type EventID,
  type Task,
  type TaskID,
  type TaskIngestEvent,
  type TaskRepetitionEvent,
  type TaskRepetitionOutcome,
  type TaskSeedInput,
} from "@withorbit/core";
import type {
  EmbeddedInlineAttachment,
  EmbeddedProjectionResponse,
  EmbeddedReviewBatch,
  EmbeddedReviewResponse,
  EmbeddedReviewSubmission,
} from "@withorbit/api";

export interface EmbeddedReviewAPI {
  read(
    accountID: string,
    taskIDs: TaskID[],
  ): Promise<EmbeddedProjectionResponse>;
  save(
    accountID: string,
    batch: EmbeddedReviewBatch,
  ): Promise<EmbeddedReviewResponse>;
}

interface PendingReview {
  review: EmbeddedReviewSubmission;
  accountID: string | null;
  provisional: boolean;
}

/** A page session, not an offline vault. Closing the page loses unsaved work. */
export class EmbeddedReviewSession {
  private accountID: string | null = null;
  private selection = 0;
  private projectionVersion = 0;
  private readVersion = 0;
  private readonly seeds = new Map<TaskID, TaskSeedInput>();
  private readonly confirmed = new Map<TaskID, Task>();
  private readonly pending = new Map<string, PendingReview>();
  private readonly accepted = new Map<string, PendingReview>();
  private readonly uploads = new Map<string, Promise<void>>();
  private readonly attachments = new Map<
    TaskID,
    Promise<EmbeddedInlineAttachment[]>
  >();

  constructor(
    private readonly options: {
      sessionID: string;
      api: EmbeddedReviewAPI;
      prepareTask?: (
        seed: TaskSeedInput,
      ) => Promise<EmbeddedInlineAttachment[]>;
      now?: () => number;
    },
  ) {}

  registerSection(seeds: readonly TaskSeedInput[]): Task[] {
    for (const seed of seeds) {
      if (!this.seeds.has(seed.taskID)) this.seeds.set(seed.taskID, seed);
    }
    return this.tasks();
  }

  tasks(accountID = this.accountID): Task[] {
    return Array.from(this.seeds.values(), (seed) => {
      // React can render a newly authenticated account before its selection
      // effect runs. Never lend that view the previous account's projection.
      if (accountID !== this.accountID) return taskFromSeed(seed);
      let task = this.confirmed.get(seed.taskID) ?? taskFromSeed(seed);
      for (const entry of this.pending.values()) {
        if (
          entry.provisional &&
          entry.accountID === this.accountID &&
          entry.review.taskID === seed.taskID
        )
          task = applyReview(task, entry.review);
      }
      return task;
    });
  }

  pendingCount(accountID = this.accountID): number {
    return Array.from(this.pending.values()).filter(
      (entry) => entry.accountID === accountID,
    ).length;
  }

  get selectedAccountID(): string | null {
    return this.accountID;
  }

  /** The publisher may relay anonymous article progress, never account data. */
  receivePageReview(review: EmbeddedReviewSubmission): void {
    if (this.accountID || review.sessionID !== this.options.sessionID) return;
    const seed = this.seeds.get(review.taskID);
    if (!seed) return;
    const existing =
      this.pending.get(review.requestID) ?? this.accepted.get(review.requestID);
    if (existing) {
      if (!sameReview(existing.review, review))
        throw new Error("Page review retry changed content");
      return;
    }
    this.seeds.set(review.taskID, review.taskSeed);
    this.pending.set(review.requestID, {
      review,
      accountID: null,
      provisional: true,
    });
  }

  async selectAccount(accountID: string | null): Promise<void> {
    this.accountID = accountID;
    this.selection++;
    this.confirmed.clear();
    if (accountID) {
      // Pin the destination before any upload can fail or authentication changes.
      for (const entry of this.pending.values()) {
        if (entry.accountID === null) entry.accountID = accountID;
      }
      await this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const accountID = this.accountID;
    const selection = this.selection;
    if (!accountID) return;
    const readVersion = ++this.readVersion;
    // A lost response can mean the server already applied the provisional mark.
    // Retry before fetching so we never overlay that mark a second time.
    await this.flush();
    if (this.selection !== selection || this.readVersion !== readVersion)
      return;
    const version = this.projectionVersion;
    const response = await this.options.api.read(accountID, [
      ...this.seeds.keys(),
    ]);
    if (
      this.selection !== selection ||
      this.projectionVersion !== version ||
      this.readVersion !== readVersion
    )
      return;
    this.confirmed.clear();
    for (const task of response.tasks) this.confirmed.set(task.id, task);
  }

  async mark(
    taskID: TaskID,
    componentID: string,
    outcome: TaskRepetitionOutcome,
    requestID?: string,
  ): Promise<{
    task: Task;
    persistence: "page" | "server";
    pageReview?: EmbeddedReviewSubmission;
  }> {
    const accountID = this.accountID;
    const selection = this.selection;
    requestID ??=
      (accountID
        ? Array.from(this.pending.values()).find(
            (entry) =>
              entry.accountID === accountID &&
              entry.review.taskID === taskID &&
              entry.review.componentID === componentID,
          )?.review.requestID
        : undefined) ?? generateUniqueID();
    const taskSeed = this.seeds.get(taskID);
    if (!taskSeed) throw new Error(`Unknown page task ${taskID}`);
    const existing =
      this.pending.get(requestID) ?? this.accepted.get(requestID);
    if (
      existing &&
      (existing.review.taskID !== taskID ||
        existing.review.componentID !== componentID ||
        existing.review.outcome !== outcome ||
        existing.accountID !== accountID)
    )
      throw new Error("Review retry changed content or account");
    if (!existing)
      this.pending.set(requestID, {
        accountID,
        provisional: accountID === null,
        review: {
          requestID,
          sessionID: this.options.sessionID,
          taskID,
          componentID,
          outcome,
          occurredAtTimestampMillis: (this.options.now ?? Date.now)(),
          taskSeed,
        },
      });
    if (accountID) await this.flush();
    if (this.selection !== selection)
      throw new Error("Account changed while saving; try again");
    return {
      task: this.tasks().find((task) => task.id === taskID)!,
      persistence: accountID ? "server" : "page",
      ...(accountID ? {} : { pageReview: this.pending.get(requestID)!.review }),
    };
  }

  async flush(): Promise<void> {
    const accountID = this.accountID;
    if (!accountID) return;
    const existing = this.uploads.get(accountID);
    if (existing) {
      await existing;
      if (this.accountID === accountID) return this.flush();
      return;
    }
    const entries = Array.from(this.pending.values()).filter(
      (entry) => entry.accountID === accountID,
    );
    if (!entries.length) return;
    const operation = this.upload(accountID, entries);
    this.uploads.set(accountID, operation);
    try {
      await operation;
    } finally {
      this.uploads.delete(accountID);
    }
  }

  private async upload(
    accountID: string,
    entries: PendingReview[],
  ): Promise<void> {
    const selection = this.selection;
    const attachments = new Map<string, EmbeddedInlineAttachment>();
    for (const seed of new Map(
      entries.map(({ review }) => [review.taskID, review.taskSeed]),
    ).values()) {
      let preparation = this.attachments.get(seed.taskID);
      if (!preparation) {
        preparation = (
          this.options.prepareTask?.(seed) ?? Promise.resolve([])
        ).catch((error) => {
          this.attachments.delete(seed.taskID);
          throw error;
        });
        this.attachments.set(seed.taskID, preparation);
      }
      for (const attachment of await preparation)
        attachments.set(attachment.attachmentID, attachment);
    }
    const response = await this.options.api.save(accountID, {
      reviews: entries.map(({ review }) => review),
      attachments: [...attachments.values()],
    });
    const acknowledged = new Set(response.acceptedRequestIDs);
    if (entries.some(({ review }) => !acknowledged.has(review.requestID))) {
      throw new Error("Server did not acknowledge the whole review batch");
    }
    for (const entry of entries) {
      this.pending.delete(entry.review.requestID);
      this.accepted.set(entry.review.requestID, entry);
    }
    if (this.accountID === accountID && this.selection === selection) {
      for (const task of response.tasks) this.confirmed.set(task.id, task);
      this.projectionVersion++;
    }
  }
}

function sameReview(a: EmbeddedReviewSubmission, b: EmbeddedReviewSubmission) {
  return (
    a.sessionID === b.sessionID &&
    a.taskID === b.taskID &&
    a.componentID === b.componentID &&
    a.outcome === b.outcome &&
    a.occurredAtTimestampMillis === b.occurredAtTimestampMillis
  );
}

export function taskFromSeed(seed: TaskSeedInput): Task {
  return eventReducer<TaskIngestEvent>(null, {
    id: seed.taskID as unknown as EventID,
    entityID: seed.taskID,
    type: EventType.TaskIngest,
    timestampMillis: seed.createdAtTimestampMillis,
    spec: seed.spec,
    provenance: seed.provenance,
    metadata: seed.metadata,
  });
}

function applyReview(task: Task, review: EmbeddedReviewSubmission): Task {
  return eventReducer<TaskRepetitionEvent>(task, {
    id: review.requestID as EventID,
    entityID: review.taskID,
    type: EventType.TaskRepetition,
    timestampMillis: review.occurredAtTimestampMillis,
    componentID: review.componentID,
    outcome: review.outcome,
    reviewSessionID: review.sessionID,
  });
}
