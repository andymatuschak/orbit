import { isDeepStrictEqual } from "node:util";
import {
  componentIDsForTaskSpec,
  generateUniqueID,
  type TaskID,
  type TaskProvenance,
  type VaultMutation,
  type VaultMutationID,
  type VaultTask,
} from "@withorbit/core";
import type {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
} from "./ingestible.js";

export const INGEST_ITEM_IDENTIFIER_KEY = "ingestSourceIdentifier" as const;
export const MissingItemIdentifierError = new Error(
  "existing item with matching source identifier does not contain item identifier",
);
export const DuplicateItemIdentifierError = (identifier: string) =>
  new Error(`item identifier '${identifier}' is not unique`);

type IngestTask = Pick<
  VaultTask,
  "spec" | "provenance" | "metadata" | "isDeleted"
>;
type NewTaskMutation = Extract<VaultMutation, { kind: "ingestTask" }>;
type DeleteTaskMutation = Extract<VaultMutation, { kind: "setTaskDeleted" }>;

/**
 * Source/item reconciliation, independent of storage and transport.
 * Sources are complete snapshots: omit a source to leave it alone; include an
 * empty source to delete its prompts. Content-hash identity means an edited
 * prompt is deleted/re-created, while an unchanged moved prompt keeps its ID.
 * An explicit task ID instead follows its task across sources and wording edits.
 */
export function ingestSources(
  sources: readonly IngestibleSource[],
  tasks: ReadonlyMap<TaskID, IngestTask>,
  opts = { ingestDateMillis: Date.now() },
): VaultMutation[] {
  const explicitTaskIDs = new Set<TaskID>();
  for (const source of sources)
    for (const item of source.items) {
      if (item.taskID === undefined) continue;
      if (
        typeof item.taskID !== "string" ||
        !/^[0-9a-zA-Z_-]{22}$/.test(item.taskID)
      )
        throw new Error(`invalid task ID '${item.taskID}'`);
      explicitTaskIDs.add(item.taskID);
    }
  const existingBySource = new Map<
    string,
    Map<IngestibleItemIdentifier, TaskID>
  >();
  const sourceIDs = new Set<string>(
    sources.map(({ identifier }) => identifier),
  );
  for (const [id, task] of tasks) {
    // Preserve the old re-add policy: do not resurrect deleted task histories.
    if (
      task.isDeleted ||
      !task.provenance ||
      !sourceIDs.has(task.provenance.identifier)
    )
      continue;
    const items = existingBySource.get(task.provenance.identifier) ?? new Map();
    const identifier = task.metadata[INGEST_ITEM_IDENTIFIER_KEY];
    // Only the supplied sources participate in reconciliation.
    if (!identifier) {
      if (explicitTaskIDs.has(id)) continue;
      throw MissingItemIdentifierError;
    }
    items.set(identifier as IngestibleItemIdentifier, id);
    existingBySource.set(task.provenance.identifier, items);
  }

  // Scope additions/deletions by source. Identical prompts in two notes are
  // distinct tasks, not one global content-hash slot.
  const additions: {
    itemID: IngestibleItemIdentifier;
    explicit: boolean;
    mutation: NewTaskMutation;
  }[] = [];
  const deletions: {
    itemID: IngestibleItemIdentifier;
    mutation: DeleteTaskMutation;
  }[] = [];
  const updates: VaultMutation[] = [];
  const claimedTaskIDs = new Set<TaskID>();
  function claim(taskID: TaskID) {
    if (claimedTaskIDs.has(taskID))
      throw new Error(`task ID '${taskID}' is claimed by more than one prompt`);
    claimedTaskIDs.add(taskID);
  }
  for (const source of sources) {
    const previous = existingBySource.get(source.identifier) ?? new Map();
    const next = mapItems(source.items);
    const provenance = createProvenanceForSource(source);
    for (const [itemID, item] of next) {
      const taskID =
        item.taskID ?? previous.get(itemID) ?? (generateUniqueID() as TaskID);
      claim(taskID);
      const task = tasks.get(taskID);
      if (task) {
        updates.push(...updateTask(taskID, task, item, provenance));
      } else {
        additions.push({
          itemID,
          explicit: item.taskID !== undefined,
          mutation: {
            kind: "ingestTask",
            mutationID: mutationID(),
            task: {
              taskID,
              createdAtTimestampMillis: opts.ingestDateMillis,
              spec: item.spec,
              provenance,
              metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: itemID },
            },
          },
        });
      }
    }
    for (const [itemID, taskID] of previous)
      deletions.push({
        itemID,
        mutation: {
          kind: "setTaskDeleted",
          mutationID: mutationID(),
          taskID,
          isDeleted: true,
        },
      });
  }

  // A unique removal/addition of the same content is a move, not a new task.
  // Ambiguous identical copies retain ordinary add/delete semantics.
  const movedAdditions = new Set<NewTaskMutation>();
  const movedDeletions = new Set<DeleteTaskMutation>();
  // A stamped move/adoption must not be deleted by its previous source snapshot.
  const unclaimedDeletions = deletions.filter(
    ({ mutation }) => !claimedTaskIDs.has(mutation.taskID),
  );
  const deletionsByItem = groupByItem(unclaimedDeletions);
  for (const [itemID, matchingAdditions] of groupByItem(
    additions.filter(({ explicit }) => !explicit),
  )) {
    const matchingDeletions = deletionsByItem.get(itemID);
    if (matchingAdditions.length === 1 && matchingDeletions?.length === 1) {
      const addition = matchingAdditions[0].mutation;
      const deletion = matchingDeletions[0].mutation;
      movedAdditions.add(addition);
      movedDeletions.add(deletion);
      claim(deletion.taskID);
      updates.push(
        ...updateTask(
          deletion.taskID,
          tasks.get(deletion.taskID)!,
          { identifier: itemID, spec: addition.task.spec },
          addition.task.provenance!,
        ),
      );
    }
  }
  return [
    ...additions
      .map(({ mutation }) => mutation)
      .filter((mutation) => !movedAdditions.has(mutation)),
    ...unclaimedDeletions
      .map(({ mutation }) => mutation)
      .filter((mutation) => !movedDeletions.has(mutation)),
    ...updates,
  ];
}

function updateTask(
  taskID: TaskID,
  task: IngestTask,
  item: IngestibleItem,
  provenance: TaskProvenance,
): VaultMutation[] {
  const updates: VaultMutation[] = [];
  if (!isDeepStrictEqual(task.spec, item.spec)) {
    if (
      componentIDsForTaskSpec(task.spec).join("\0") !==
      componentIDsForTaskSpec(item.spec).join("\0")
    )
      throw new Error(`task '${taskID}' cannot change component IDs`);
    updates.push({
      kind: "updateTaskSpec",
      mutationID: mutationID(),
      taskID,
      spec: item.spec,
    });
  }
  if (!isDeepStrictEqual(task.provenance, provenance))
    updates.push(updateProvenance(taskID, provenance));
  if (task.metadata[INGEST_ITEM_IDENTIFIER_KEY] !== item.identifier)
    updates.push({
      kind: "mergeTaskMetadata",
      mutationID: mutationID(),
      taskID,
      metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: item.identifier },
    });
  if (task.isDeleted)
    updates.push({
      kind: "setTaskDeleted",
      mutationID: mutationID(),
      taskID,
      isDeleted: false,
    });
  return updates;
}

function groupByItem<T extends { itemID: IngestibleItemIdentifier }>(
  items: readonly T[],
) {
  const groups = new Map<IngestibleItemIdentifier, T[]>();
  for (const item of items) {
    const group = groups.get(item.itemID) ?? [];
    group.push(item);
    groups.set(item.itemID, group);
  }
  return groups;
}

function mapItems(items: readonly IngestibleItem[]) {
  const mapping = new Map<IngestibleItemIdentifier, IngestibleItem>();
  for (const item of items) {
    if (mapping.has(item.identifier))
      throw DuplicateItemIdentifierError(item.identifier);
    mapping.set(item.identifier, item);
  }
  return mapping;
}

function createProvenanceForSource(source: IngestibleSource): TaskProvenance {
  return {
    identifier: source.identifier,
    title: source.title,
    ...(source.url ? { url: source.url } : {}),
    ...(source.colorPaletteName
      ? { colorPaletteName: source.colorPaletteName }
      : {}),
  };
}

function updateProvenance(
  taskID: TaskID,
  provenance: TaskProvenance,
): VaultMutation {
  return {
    kind: "updateTaskProvenance",
    mutationID: mutationID(),
    taskID,
    provenance,
  };
}

function mutationID() {
  return generateUniqueID() as unknown as VaultMutationID;
}
