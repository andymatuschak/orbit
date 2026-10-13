import { isDeepStrictEqual } from "node:util";
import {
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

type IngestTask = Pick<VaultTask, "provenance" | "metadata" | "isDeleted">;
type NewTaskMutation = Extract<VaultMutation, { kind: "ingestTask" }>;
type DeleteTaskMutation = Extract<VaultMutation, { kind: "setTaskDeleted" }>;

/**
 * The original source/item reconciler, independent of storage and transport.
 * Sources are complete snapshots: omit a source to leave it alone; include an
 * empty source to delete its prompts. Content-hash identity means an edited
 * prompt is deleted/re-created, while an unchanged moved prompt keeps its ID.
 */
export function ingestSources(
  sources: readonly IngestibleSource[],
  tasks: ReadonlyMap<TaskID, IngestTask>,
  opts = { ingestDateMillis: Date.now() },
): VaultMutation[] {
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
    if (!identifier) throw MissingItemIdentifierError;
    items.set(identifier as IngestibleItemIdentifier, id);
    existingBySource.set(task.provenance.identifier, items);
  }

  // Scope additions/deletions by source. Identical prompts in two notes are
  // distinct tasks, not one global content-hash slot.
  const additions: {
    itemID: IngestibleItemIdentifier;
    mutation: NewTaskMutation;
  }[] = [];
  const deletions: {
    itemID: IngestibleItemIdentifier;
    mutation: DeleteTaskMutation;
  }[] = [];
  const updates: VaultMutation[] = [];
  for (const source of sources) {
    const previous = existingBySource.get(source.identifier) ?? new Map();
    const next = mapItems(source.items);
    const provenance = createProvenanceForSource(source);
    for (const [itemID, item] of next) {
      const taskID = previous.get(itemID);
      if (taskID) {
        if (!isDeepStrictEqual(tasks.get(taskID)!.provenance, provenance))
          updates.push(updateProvenance(taskID, provenance));
      } else {
        additions.push({
          itemID,
          mutation: {
            kind: "ingestTask",
            mutationID: mutationID(),
            task: {
              taskID: generateUniqueID() as TaskID,
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
      if (!next.has(itemID))
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
  const deletionsByItem = groupByItem(deletions);
  for (const [itemID, matchingAdditions] of groupByItem(additions)) {
    const matchingDeletions = deletionsByItem.get(itemID);
    if (matchingAdditions.length === 1 && matchingDeletions?.length === 1) {
      const addition = matchingAdditions[0].mutation;
      const deletion = matchingDeletions[0].mutation;
      movedAdditions.add(addition);
      movedDeletions.add(deletion);
      updates.push(
        updateProvenance(deletion.taskID, addition.task.provenance!),
      );
    }
  }
  return [
    ...additions
      .map(({ mutation }) => mutation)
      .filter((mutation) => !movedAdditions.has(mutation)),
    ...deletions
      .map(({ mutation }) => mutation)
      .filter((mutation) => !movedDeletions.has(mutation)),
    ...updates,
  ];
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
