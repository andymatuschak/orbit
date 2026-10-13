import {
  createReviewQueue,
  defaultOrbitSchedulerPolicy,
  defaultReviewSessionMaximumQueueSize,
  getReviewQueueFuzzyDueTimestampThreshold,
  projectVault,
  referencedAttachmentIDs,
  type AttachmentID,
  type AttachmentMIMEType,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type ReviewItem,
  type SchedulingObservation,
  type Task,
  type TaskID,
  type VaultAttachment,
  type VaultID,
  type VaultMutation,
  type VaultProjectionSnapshot,
  type VaultTask,
} from "@withorbit/core";
import {
  decodePerTaskVaultRoot,
  decodePerTaskVaultCatalog,
  decodePerTaskVaultTask,
  decodeScheduler,
  type CatalogGenerationDescriptor,
  type PerTaskVaultRoot,
  type PerTaskVaultCatalog,
  type PerTaskVaultTask,
} from "./perTaskCodec.js";
import {
  derivePerTaskCatalogEntry,
  projectPerTask,
  rankActivePerTaskEntries,
  rankProjectedPerTaskTasks,
  sameTaskHeads,
  type PerTaskCatalogEntry,
} from "./perTaskVault.js";
import {
  canonicalJSONString,
  encodeTask,
  packObservation,
  planMutationsForTask,
  type TaskMutation,
} from "./taskMutationPlanner.js";

export type DocumentPatch =
  | { kind: "put"; path: string[]; value: unknown }
  | { kind: "delete"; path: string[] };
export interface DocumentSnapshot {
  /** Packed schema-2 fields, with Automerge immutable strings unwrapped. */
  data: unknown;
  heads: string[];
  conflicts?: { path: string[]; variantCount: number }[];
  conflictCount?: number;
  hasRequestedHeads?: boolean;
}

/** Document access, not a second persistence system. Writes resolve after local durability. */
export interface PerTaskDocuments {
  read(
    url: AutomergeDocumentURL,
    options?: { localOnly?: boolean; heads?: readonly string[] },
  ): Promise<DocumentSnapshot | undefined>;
  readMany?(
    urls: readonly AutomergeDocumentURL[],
    options?: { localOnly?: boolean },
  ): Promise<(DocumentSnapshot | undefined)[]>;
  create(
    data: unknown,
    url?: AutomergeDocumentURL,
  ): Promise<{ url: AutomergeDocumentURL; snapshot: DocumentSnapshot }>;
  patch(
    url: AutomergeDocumentURL,
    patches: readonly DocumentPatch[],
  ): Promise<void>;
  fetch?(url: AutomergeDocumentURL): Promise<boolean>;
  subscribe?(listener: (url: AutomergeDocumentURL) => void): () => void;
  readAttachment?(
    attachment: VaultAttachment,
  ): Promise<{ bytes: Uint8Array; mediaType: AttachmentMIMEType }>;
  close?(): Promise<void>;
}

export interface CreatePerTaskVaultOptions {
  rootURL?: AutomergeDocumentURL;
  catalogURL?: AutomergeDocumentURL;
  taskURLs?: Readonly<Record<TaskID, AutomergeDocumentURL>>;
}

export class CatalogUnavailableError extends Error {
  constructor() {
    super("No announced catalog generation is available");
  }
}

/** One schema-2 repository for Repo JS and Repo Swift. Catalogs remain derived. */
export class PerTaskRepository {
  private operation: Promise<unknown> = Promise.resolve();
  private closed = false;
  private dirty = false;
  private readonly listeners = new Set<() => void>();
  private readonly fetches = new Set<AutomergeDocumentURL>();
  private conflictScanKey: string | null = null;

  private constructor(
    readonly documents: PerTaskDocuments,
    readonly rootURL: AutomergeDocumentURL,
    private root: PerTaskVaultRoot,
    public catalogURL: AutomergeDocumentURL,
    private catalog: PerTaskVaultCatalog,
    private readonly detach?: () => void,
  ) {}

  get vaultID(): VaultID {
    return this.root.vaultID;
  }

  get isClosed(): boolean {
    return this.closed;
  }

  static async open(
    documents: PerTaskDocuments,
    rootURL: AutomergeDocumentURL,
    preparedRoot?: DocumentSnapshot,
    options: { localOnly?: boolean } = {},
  ): Promise<PerTaskRepository> {
    let result: PerTaskRepository | undefined;
    let changedDuringOpening = false;
    // Subscribe before reading so changes during catalog selection also mark
    // the opening snapshots dirty. Keep that subscription for repository ownership.
    const detach = documents.subscribe?.((url) => {
      if (!result) {
        changedDuringOpening = true;
        return;
      }
      if (url === result.rootURL || url === result.catalogURL)
        result.dirty = true;
      result.emit();
    });
    try {
      const snapshot = preparedRoot ?? (await required(documents, rootURL));
      assertAuthoritative(snapshot, rootURL);
      const root = decodePerTaskVaultRoot(snapshot.data);
      const selected = await selectCatalog(documents, root, options.localOnly);
      result = new PerTaskRepository(
        documents,
        rootURL,
        root,
        selected.descriptor.documentURL,
        selected.catalog,
        detach,
      );
      // Operational creation can supply a snapshot taken before subscription.
      result.dirty = changedDuringOpening || preparedRoot !== undefined;
      result.scheduleConflictRepair(selected.snapshot);
      if (root.catalogCandidates[0].documentURL !== result.catalogURL)
        result.fetch(root.catalogCandidates[0].documentURL);
      return result;
    } catch (error) {
      detach?.();
      throw error;
    }
  }

  static createEmpty(
    documents: PerTaskDocuments,
    identity: { vaultID: VaultID; createdAtTimestampMillis?: number },
  ): Promise<PerTaskRepository> {
    return this.create(documents, {
      vaultID: identity.vaultID,
      createdAtTimestampMillis: identity.createdAtTimestampMillis ?? Date.now(),
      scheduler: defaultOrbitSchedulerPolicy,
      tasks: {},
      observations: {},
      attachments: {},
    });
  }

  static async create(
    documents: PerTaskDocuments,
    source: OrbitVault,
    options: CreatePerTaskVaultOptions = {},
  ): Promise<PerTaskRepository> {
    decodeScheduler(source.scheduler, "$source.scheduler");
    const requested = [
      options.rootURL,
      options.catalogURL,
      ...Object.values(options.taskURLs ?? {}),
    ].filter(Boolean);
    if (new Set(requested).size !== requested.length)
      throw new Error("Vault document URLs must be unique");
    const grouped = new Map<
      TaskID,
      Record<ObservationID, SchedulingObservation>
    >();
    for (const [id, observation] of Object.entries(source.observations)) {
      if (!source.tasks[observation.taskID])
        throw new Error("Observation references missing task");
      const group = grouped.get(observation.taskID) ?? {};
      group[id as ObservationID] = observation;
      grouped.set(observation.taskID, group);
    }
    const entries: Record<TaskID, PerTaskCatalogEntry> = {};
    // Authoritative documents are durable before any catalog can reference them.
    for (const [id, task] of Object.entries(source.tasks)) {
      const taskID = id as TaskID;
      const logical: PerTaskVaultTask = {
        documentType: "com.withorbit.vault-task",
        schemaVersion: 2,
        vaultID: source.vaultID,
        taskID,
        task,
        observations: grouped.get(taskID) ?? {},
      };
      const created = await documents.create(
        encodeTaskDocument(logical),
        options.taskURLs?.[taskID],
      );
      entries[taskID] = derivePerTaskCatalogEntry(
        source,
        created.url,
        logical,
        created.snapshot.heads,
      );
    }
    const catalog = await documents.create(
      {
        documentType: "com.withorbit.vault-task-catalog",
        schemaVersion: 2,
        vaultID: source.vaultID,
        generation: 0,
        predecessorDocumentURL: null,
        entries: Object.fromEntries(
          Object.entries(entries).map(([id, entry]) => [
            id,
            canonicalJSONString(entry),
          ]),
        ),
      },
      options.catalogURL,
    );
    const descriptor: CatalogGenerationDescriptor = {
      generation: 0,
      documentURL: catalog.url,
      predecessorDocumentURL: null,
      initialCatalogHeads: catalog.snapshot.heads,
    };
    const root = await documents.create(
      {
        documentType: "com.withorbit.vault-root",
        schemaVersion: 2,
        vaultID: source.vaultID,
        createdAtTimestampMillis: source.createdAtTimestampMillis,
        scheduler: source.scheduler,
        attachments: source.attachments,
        catalogCandidates: {
          [candidateKey(descriptor)]: canonicalJSONString(descriptor),
        },
      },
      options.rootURL,
    );
    return this.open(documents, root.url, root.snapshot);
  }

  apply(mutations: readonly VaultMutation[]): Promise<void> {
    return this.exclusive(async () => {
      await this.refresh();
      const attachments = { ...this.root.attachments };
      const patches: DocumentPatch[] = [];
      const grouped = new Map<TaskID, TaskMutation[]>();
      for (const mutation of mutations) {
        if (mutation.kind === "registerAttachment") {
          const existing = attachments[mutation.attachmentID];
          if (
            existing &&
            canonicalJSONString(existing) !==
              canonicalJSONString(mutation.attachment)
          )
            throw new Error("Attachment ID already has divergent content");
          if (!existing) {
            attachments[mutation.attachmentID] = mutation.attachment;
            patches.push({
              kind: "put",
              path: ["attachments", mutation.attachmentID],
              value: mutation.attachment,
            });
          }
          continue;
        }
        const id =
          mutation.kind === "ingestTask"
            ? mutation.task.taskID
            : mutation.taskID;
        const group = grouped.get(id) ?? [];
        group.push(mutation);
        grouped.set(id, group);
      }
      if (mutations.some(({ kind }) => kind === "registerAttachment")) {
        await this.documents.patch(this.rootURL, patches);
        this.root.attachments = attachments;
      }
      for (const [id, group] of grouped) await this.applyTask(id, group);
      if (mutations.length) this.emit();
    });
  }

  getReviewQueue(
    nowTimestampMillis = Date.now(),
    maximumTaskCount = defaultReviewSessionMaximumQueueSize,
  ): Promise<ReviewItem[]> {
    return this.exclusive(async () => {
      assertBound(maximumTaskCount);
      await this.refresh();
      const threshold =
        getReviewQueueFuzzyDueTimestampThreshold(nowTimestampMillis);
      for (;;) {
        const selected = rankActivePerTaskEntries(this.catalog.entries)
          .filter(([, entry]) => entry.nextDueTimestampMillis <= threshold)
          .slice(0, maximumTaskCount);
        const tasks = await this.projectEntries(selected, "cached", threshold);
        // Repair can remove the entire capped window. Select its successors
        // before concluding there are no due prompts beyond that old window.
        if (
          !tasks.length &&
          selected.some(([id, entry]) => this.catalog.entries[id] !== entry)
        )
          continue;
        return createReviewQueue(tasks, maximumTaskCount);
      }
    });
  }

  getTaskProjections(
    taskIDs: readonly TaskID[],
  ): Promise<{ tasks: ReadonlyMap<TaskID, Task> }> {
    return this.exclusive(async () => {
      await this.refresh();
      const entries = [...new Set(taskIDs)].flatMap((id) =>
        this.catalog.entries[id]
          ? [[id, this.catalog.entries[id]] as [TaskID, PerTaskCatalogEntry]]
          : [],
      );
      const tasks = await this.projectEntries(entries);
      return {
        tasks: new Map(tasks.map((task) => [task.id, task])),
      };
    });
  }

  /** Import reconciliation needs definitions, not a replay of every review. */
  getTaskDefinitions(
    taskIDs?: readonly TaskID[],
  ): Promise<ReadonlyMap<TaskID, VaultTask>> {
    return this.exclusive(async () => {
      await this.refresh();
      const entries = taskIDs
        ? taskIDs.map((id): [TaskID, PerTaskCatalogEntry] => {
            const entry = this.catalog.entries[id];
            if (!entry)
              throw new Error(`Task is absent from the catalog: ${id}`);
            return [id, entry];
          })
        : (Object.entries(this.catalog.entries) as [
            TaskID,
            PerTaskCatalogEntry,
          ][]);
      const loaded = await this.readEntries(entries);
      return new Map(
        [...loaded.values()].map(({ document }) => [
          document.taskID,
          document.task,
        ]),
      );
    });
  }

  readTaskObservation(
    taskID: TaskID,
    observationID: ObservationID,
  ): Promise<SchedulingObservation | null> {
    return this.exclusive(async () => {
      await this.refresh();
      const entry = this.catalog.entries[taskID];
      if (!entry) return null;
      return (
        this.decodeTask(
          await required(this.documents, entry.documentURL),
          entry.documentURL,
          taskID,
        ).observations[observationID] ?? null
      );
    });
  }

  readLogicalVault(): Promise<OrbitVault> {
    return this.exclusive(async () => {
      await this.refresh();
      return this.logicalVault();
    });
  }

  getProjection(): Promise<VaultProjectionSnapshot> {
    return this.exclusive(async () => {
      await this.refresh();
      return projectVault({
        document: await this.logicalVault(),
      });
    });
  }

  /** Inspect catalog rows without materializing task histories. */
  getCatalogEntries(): Promise<Readonly<Record<TaskID, PerTaskCatalogEntry>>> {
    return this.exclusive(async () => {
      await this.refresh();
      return { ...this.catalog.entries };
    });
  }

  /** Startup priority only; previously cached tasks outside this set also need sync. */
  getReviewWorkingSetDocumentURLs(): Promise<AutomergeDocumentURL[]> {
    return this.exclusive(async () => {
      await this.refresh();
      return [
        this.rootURL,
        this.catalogURL,
        ...rankActivePerTaskEntries(this.catalog.entries)
          .slice(0, defaultReviewSessionMaximumQueueSize)
          .map(([, entry]) => entry.documentURL),
      ];
    });
  }

  readAttachment(
    attachmentID: AttachmentID,
  ): Promise<{ bytes: Uint8Array; mediaType: AttachmentMIMEType } | null> {
    return this.exclusive(async () => {
      await this.refresh();
      const attachment = this.root.attachments[attachmentID];
      if (!attachment) return null;
      if (!this.documents.readAttachment)
        throw new Error("Attachment reading unavailable");
      return this.documents.readAttachment(attachment);
    });
  }

  repairCatalog(): Promise<number> {
    return this.exclusive(async () => {
      await this.refresh();
      const snapshot = await required(this.documents, this.catalogURL);
      const conflicts = new Set(
        catalogConflictTaskIDs(snapshot, this.catalogURL, this.catalog),
      );
      const selected = Object.entries(this.catalog.entries) as [
        TaskID,
        PerTaskCatalogEntry,
      ][];
      const loaded = await this.readEntries(selected);
      const stale = selected
        .filter(
          ([id, entry]) =>
            conflicts.has(id) ||
            !sameTaskHeads(
              entry.indexedTaskHeads,
              loaded.get(entry.documentURL)!.heads,
            ),
        )
        .map(([id]) => id);
      return (await this.repair(stale, async (url) => loaded.get(url)))
        .repairedTaskIDs.length;
    });
  }

  /** Explicit maintenance operation; never creates generations automatically. */
  rolloverCatalog(
    documentURL?: AutomergeDocumentURL,
  ): Promise<CatalogGenerationDescriptor> {
    return this.exclusive(async () => {
      await this.refresh();
      const generation =
        Math.max(
          ...this.root.catalogCandidates.map(({ generation }) => generation),
        ) + 1;
      const selected = Object.entries(this.catalog.entries) as [
        TaskID,
        PerTaskCatalogEntry,
      ][];
      const loaded = await this.readEntries(selected);
      const entries = Object.fromEntries(
        selected.map(([id, entry]) => {
          const task = loaded.get(entry.documentURL)!;
          return [
            id,
            canonicalJSONString(
              derivePerTaskCatalogEntry(
                this.root,
                entry.documentURL,
                task.document,
                task.heads,
              ),
            ),
          ];
        }),
      );
      const created = await this.documents.create(
        {
          documentType: "com.withorbit.vault-task-catalog",
          schemaVersion: 2,
          vaultID: this.vaultID,
          generation,
          predecessorDocumentURL: this.catalogURL,
          entries,
        },
        documentURL,
      );
      const descriptor: CatalogGenerationDescriptor = {
        generation,
        documentURL: created.url,
        predecessorDocumentURL: this.catalogURL,
        initialCatalogHeads: created.snapshot.heads,
      };
      await this.documents.patch(this.rootURL, [
        {
          kind: "put",
          path: ["catalogCandidates", candidateKey(descriptor)],
          value: canonicalJSONString(descriptor),
        },
      ]);
      this.root.catalogCandidates.push(descriptor);
      this.root.catalogCandidates.sort(
        (a, b) =>
          b.generation - a.generation ||
          a.documentURL.localeCompare(b.documentURL),
      );
      this.catalogURL = created.url;
      this.catalog = decodePerTaskVaultCatalog(created.snapshot.data);
      return descriptor;
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.detach?.();
    await this.operation;
    this.listeners.clear();
    await this.documents.close?.();
  }

  private async applyTask(taskID: TaskID, mutations: readonly TaskMutation[]) {
    const entry = this.catalog.entries[taskID];
    let document: PerTaskVaultTask;
    if (entry) {
      document = this.decodeTask(
        await required(this.documents, entry.documentURL),
        entry.documentURL,
        taskID,
      );
    } else {
      const seed = mutations
        .flatMap((mutation) =>
          mutation.kind === "ingestTask"
            ? [mutation.task]
            : mutation.kind === "recordReview" && mutation.taskSeed
              ? [mutation.taskSeed]
              : [],
        )
        .find((seed) => seed.taskID === taskID);
      if (!seed) throw new Error("Missing task " + taskID);
      for (const id of referencedAttachmentIDs(seed.spec)) {
        if (!this.root.attachments[id])
          throw new Error("Attachment " + id + " is not registered");
      }
      document = {
        documentType: "com.withorbit.vault-task",
        schemaVersion: 2,
        vaultID: this.vaultID,
        taskID,
        task: {
          createdAtTimestampMillis: seed.createdAtTimestampMillis,
          spec: seed.spec,
          provenance: seed.provenance,
          metadata: seed.metadata ?? {},
          isDeleted: false,
        },
        observations: {},
      };
    }
    const plan = planMutationsForTask({
      document,
      attachments: this.root.attachments,
      mutations,
    });
    let url: AutomergeDocumentURL;
    let snapshot: DocumentSnapshot;
    if (entry) {
      url = entry.documentURL;
      // A failed flush can leave an idempotent mutation visible in memory.
      // Even an empty retry must cross the task's durability boundary again.
      await this.documents.patch(url, plan.patches);
      snapshot = await required(this.documents, url);
    } else {
      // Create the final document once, including its first review and metadata.
      // create() itself crosses the same local durability boundary as patch().
      const created = await this.documents.create(
        encodeTaskDocument(plan.document),
      );
      url = created.url;
      snapshot = created.snapshot;
    }
    const current = this.decodeTask(snapshot, url, taskID);
    const replacement = derivePerTaskCatalogEntry(
      this.root,
      url,
      current,
      snapshot.heads,
    );
    // This flush happens strictly after the authoritative task flush.
    await this.writeEntries([[taskID, replacement]]);
  }

  private async refresh() {
    if (this.documents.subscribe && !this.dirty) return;
    this.dirty = false;
    try {
      const snapshot = await required(this.documents, this.rootURL);
      assertAuthoritative(snapshot, this.rootURL);
      const root = decodePerTaskVaultRoot(snapshot.data);
      if (root.vaultID !== this.vaultID)
        throw new Error("Remote root changed immutable vault identity");
      const selected = await selectCatalog(this.documents, root);
      this.root = root;
      this.catalog = selected.catalog;
      this.catalogURL = selected.descriptor.documentURL;
      this.scheduleConflictRepair(selected.snapshot);
      if (root.catalogCandidates[0].documentURL !== this.catalogURL)
        this.fetch(root.catalogCandidates[0].documentURL);
    } catch (error) {
      this.dirty = true;
      throw error;
    }
  }

  private async readEntries(
    entries: readonly [TaskID, PerTaskCatalogEntry][],
    localOnly = false,
  ) {
    const urls = entries.map(([, entry]) => entry.documentURL);
    const snapshots = this.documents.readMany
      ? await this.documents.readMany(urls, { localOnly })
      : await Promise.all(
          urls.map((url) => this.documents.read(url, { localOnly })),
        );
    const loaded = new Map<
      AutomergeDocumentURL,
      { document: PerTaskVaultTask; heads: string[] }
    >();
    for (let i = 0; i < entries.length; i++) {
      const [id, entry] = entries[i];
      const snapshot = snapshots[i];
      if (!snapshot) {
        if (!localOnly)
          throw new Error(
            "Automerge document unavailable: " + entry.documentURL,
          );
        continue;
      }
      const document = this.decodeTask(snapshot, entry.documentURL, id);
      loaded.set(entry.documentURL, { document, heads: snapshot.heads });
    }
    return loaded;
  }

  private async projectEntries(
    entries: readonly [TaskID, PerTaskCatalogEntry][],
    mode: "strict" | "cached" = "strict",
    dueTimestampThreshold?: number,
  ): Promise<Task[]> {
    const localOnly = mode !== "strict";
    const loaded = await this.readEntries(entries, localOnly);
    const tasks: Task[] = [];
    const stale: TaskID[] = [];
    for (const [id, entry] of entries) {
      const current = loaded.get(entry.documentURL);
      if (!current) continue;
      if (!sameTaskHeads(current.heads, entry.indexedTaskHeads)) stale.push(id);
      const task = projectPerTask(this.root, current.document).tasks.get(id);
      if (task && !task.isDeleted) tasks.push(task);
    }
    await this.repair(stale, async (url) => loaded.get(url));
    const ranked = rankProjectedPerTaskTasks(tasks);
    const usable =
      dueTimestampThreshold === undefined
        ? ranked
        : ranked.filter((task) =>
            Object.values(task.componentStates).some(
              ({ dueTimestampMillis }) =>
                dueTimestampMillis <= dueTimestampThreshold,
            ),
          );
    if (localOnly && loaded.size < entries.length) {
      // Present but deleted/not-due tasks are not usable prompts. If none
      // remain, wait for remote tasks instead of reporting an empty queue.
      if (!usable.length)
        return this.projectEntries(entries, "strict", dueTimestampThreshold);
      for (const [, entry] of entries)
        if (!loaded.has(entry.documentURL)) this.fetch(entry.documentURL);
    }
    return usable;
  }

  private decodeTask(
    snapshot: DocumentSnapshot,
    url: AutomergeDocumentURL,
    taskID: TaskID,
  ): PerTaskVaultTask {
    assertAuthoritative(snapshot, url);
    const task = decodePerTaskVaultTask(snapshot.data);
    if (task.vaultID !== this.vaultID || task.taskID !== taskID)
      throw new Error("Task document identity mismatch");
    return task;
  }

  private async logicalVault(): Promise<OrbitVault> {
    const loaded = await this.readEntries(
      Object.entries(this.catalog.entries) as [TaskID, PerTaskCatalogEntry][],
    );
    const tasks: OrbitVault["tasks"] = {};
    const observations: OrbitVault["observations"] = {};
    for (const { document } of loaded.values()) {
      tasks[document.taskID] = document.task;
      Object.assign(observations, document.observations);
    }
    return {
      vaultID: this.vaultID,
      createdAtTimestampMillis: this.root.createdAtTimestampMillis,
      scheduler: this.root.scheduler,
      attachments: { ...this.root.attachments },
      tasks,
      observations,
    };
  }

  /** The visible catalog value chooses the URL; its task supplies derived fields. */
  private async repair(
    taskIDs: readonly TaskID[],
    readTask: (
      url: AutomergeDocumentURL,
    ) => Promise<{ document: PerTaskVaultTask; heads: string[] } | undefined>,
  ) {
    const replacements: [TaskID, PerTaskCatalogEntry][] = [];
    const missingDocumentURLs: AutomergeDocumentURL[] = [];
    for (const taskID of new Set(taskIDs)) {
      const selected = this.catalog.entries[taskID];
      if (!selected) throw new Error(`Missing catalog entry ${taskID}`);
      const loaded = await readTask(selected.documentURL);
      if (!loaded) {
        missingDocumentURLs.push(selected.documentURL);
        continue;
      }
      if (
        loaded.document.vaultID !== this.vaultID ||
        loaded.document.taskID !== taskID
      ) {
        throw new Error("Task document does not belong to its catalog entry");
      }
      replacements.push([
        taskID,
        derivePerTaskCatalogEntry(
          this.root,
          selected.documentURL,
          loaded.document,
          loaded.heads,
        ),
      ]);
    }
    await this.writeEntries(replacements);
    return {
      repairedTaskIDs: replacements.map(([taskID]) => taskID),
      missingDocumentURLs,
    };
  }

  private async writeEntries(
    replacements: readonly [TaskID, PerTaskCatalogEntry][],
  ) {
    if (!replacements.length) return;
    await this.documents.patch(
      this.catalogURL,
      replacements.map(([id, entry]) => ({
        kind: "put",
        path: ["entries", id],
        value: canonicalJSONString(entry),
      })),
    );
    for (const [id, entry] of replacements) this.catalog.entries[id] = entry;
  }

  private scheduleConflictRepair(snapshot: DocumentSnapshot) {
    const ids = catalogConflictTaskIDs(snapshot, this.catalogURL, this.catalog);
    if (!ids.length) return;
    const key = this.catalogURL + ":" + snapshot.heads.join(",");
    if (key === this.conflictScanKey) return;
    this.conflictScanKey = key;
    const catalogURL = this.catalogURL;
    setTimeout(() => {
      if (this.closed) return;
      void this.exclusive(async () => {
        await this.refresh();
        if (this.catalogURL !== catalogURL) return;
        const result = await this.repair(ids, async (url) => {
          const task = await this.documents.read(url, { localOnly: true });
          if (!task) return undefined;
          assertAuthoritative(task, url);
          return {
            document: decodePerTaskVaultTask(task.data),
            heads: task.heads,
          };
        });
        if (result.missingDocumentURLs.length) {
          this.conflictScanKey = null;
          for (const url of result.missingDocumentURLs) this.fetch(url);
        }
        this.emit();
      }).catch((error: unknown) => {
        this.conflictScanKey = null;
        console.warn("Could not repair conflicting catalog entries", error);
      });
    }, 0);
  }

  private fetch(url: AutomergeDocumentURL) {
    if (!this.documents.fetch || this.fetches.has(url)) return;
    this.fetches.add(url);
    void this.documents
      .fetch(url)
      .then((available) => {
        if (available && !this.closed) {
          this.dirty = true;
          this.emit();
        }
      })
      .catch(() => undefined)
      .finally(() => this.fetches.delete(url));
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error("Vault is closed");
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export function encodeTaskDocument(document: PerTaskVaultTask) {
  return {
    documentType: document.documentType,
    schemaVersion: 2,
    vaultID: document.vaultID,
    taskID: document.taskID,
    task: encodeTask(document.task),
    observations: Object.fromEntries(
      Object.entries(document.observations).map(([id, observation]) => [
        id,
        packObservation(observation),
      ]),
    ),
  };
}

async function required(
  documents: PerTaskDocuments,
  url: AutomergeDocumentURL,
): Promise<DocumentSnapshot> {
  const result = await documents.read(url);
  if (!result) throw new Error("Automerge document unavailable: " + url);
  return result;
}

async function selectCatalog(
  documents: PerTaskDocuments,
  root: PerTaskVaultRoot,
  localOnly = false,
) {
  // Prefer any available local generation before waiting on a peer. A newly
  // signed-in device has no fallback at all, so it must fetch an announcement.
  for (const fetchMissing of [false, true]) {
    if (fetchMissing && (localOnly || !documents.fetch)) break;
    for (const descriptor of root.catalogCandidates) {
      let snapshot = await documents.read(descriptor.documentURL, {
        localOnly: true,
        heads: descriptor.initialCatalogHeads,
      });
      if (
        !snapshot &&
        fetchMissing &&
        (await documents.fetch!(descriptor.documentURL))
      ) {
        snapshot = await documents.read(descriptor.documentURL, {
          localOnly: true,
          heads: descriptor.initialCatalogHeads,
        });
      }
      if (!snapshot) continue;
      const catalog = decodePerTaskVaultCatalog(snapshot.data);
      if (
        catalog.vaultID !== root.vaultID ||
        catalog.generation !== descriptor.generation ||
        catalog.predecessorDocumentURL !== descriptor.predecessorDocumentURL ||
        snapshot.hasRequestedHeads === false
      )
        continue;
      return { descriptor, snapshot, catalog };
    }
  }
  throw new CatalogUnavailableError();
}

function assertAuthoritative(
  snapshot: DocumentSnapshot,
  url: AutomergeDocumentURL,
) {
  if (
    (snapshot.conflictCount ?? 0) !== 0 ||
    (snapshot.conflicts?.length ?? 0) > 0
  )
    throw new Error("Projection stopped at Automerge conflicts in " + url);
}

function catalogConflictTaskIDs(
  snapshot: DocumentSnapshot,
  url: AutomergeDocumentURL,
  catalog: PerTaskVaultCatalog,
): TaskID[] {
  const conflicts = snapshot.conflicts ?? [];
  if (
    conflicts.some(
      ({ path, variantCount }) =>
        path.length !== 2 ||
        path[0] !== "entries" ||
        !Object.hasOwn(catalog.entries, path[1]) ||
        !Number.isInteger(variantCount) ||
        variantCount < 2,
    ) ||
    (snapshot.conflictCount !== undefined &&
      conflicts.reduce(
        (count, { variantCount }) => count + variantCount - 1,
        0,
      ) !== snapshot.conflictCount)
  ) {
    throw new Error("Unrepairable catalog conflicts in " + url);
  }
  return [...new Set(conflicts.map(({ path }) => path[1] as TaskID))];
}

function candidateKey(descriptor: CatalogGenerationDescriptor): string {
  return (
    String(descriptor.generation).padStart(16, "0") +
    ":" +
    descriptor.documentURL
  );
}

function assertBound(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid review scheduling task bound");
}
