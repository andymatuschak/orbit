import {
  canUpdateTaskSpecComponents,
  defaultOrbitSchedulerPolicy,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type ObservationID,
  type AutomergeDocumentURL,
  type TaskID,
  type TaskSpec,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import { decodePerTaskVaultTask } from "./perTaskCodec.js";
import { encodeTask, planMutationsForTask } from "./taskMutationPlanner.js";
import { derivePerTaskCatalogEntry, projectPerTask } from "./perTaskVault.js";
import type { DocumentPatch } from "./perTaskRepository.js";

describe("per-task mutation planner", () => {
  test("review seeds never alter an existing task or resurrect its deletion", () => {
    const document = decodePerTaskVaultTask({
      documentType: "com.withorbit.vault-task",
      schemaVersion: 2,
      vaultID: "review-seed" as VaultID,
      taskID,
      task: encodeTask({
        createdAtTimestampMillis: 1_000,
        spec: plainSpec("Existing"),
        provenance: null,
        metadata: { source: "existing" },
        isDeleted: true,
      }),
      observations: {},
    });
    const { patches } = planMutationsForTask({
      document,
      attachments: {},
      mutations: [
        {
          kind: "recordReview",
          mutationID: mutationID("seed-review"),
          taskID,
          taskSeed: {
            taskID,
            createdAtTimestampMillis: 0,
            spec: plainSpec("Seed"),
            provenance: null,
            metadata: { source: "seed" },
          },
          observationID: observationID("seed-review"),
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 2_000,
        },
      ],
    });
    expect(patches.map(({ path }) => path[0])).toEqual(["observations"]);
    expect(document.task.isDeleted).toBe(true);
    expect(document.task.metadata).toEqual({ source: "existing" });
  });

  test("plans schema-2 task writes directly, without shard paths", () => {
    const rawDocument = {
      documentType: "com.withorbit.vault-task",
      schemaVersion: 2,
      vaultID: "vault-native-planner" as VaultID,
      taskID,
      task: encodeTask({
        createdAtTimestampMillis: 1_000,
        spec: plainSpec("Initial"),
        provenance: null,
        metadata: {},
        isDeleted: false,
      }),
      observations: {},
    };
    const mutations = history();
    const { patches, document: planned } = planMutationsForTask({
      document: decodePerTaskVaultTask(rawDocument),
      attachments: {},
      mutations,
    });
    expect(patches.some(({ path }) => path[0] === "tasks")).toBe(false);
    expect(patches.some(({ path }) => path[0] === "task")).toBe(true);
    applyPatches(rawDocument, patches);
    const updated = decodePerTaskVaultTask(rawDocument);
    expect(planned).toEqual(updated);
    expect(updated.task).toMatchObject({
      isDeleted: true,
      metadata: { source: "typed" },
      spec: plainSpec("Edited"),
    });
    expect(Object.keys(updated.observations)).toHaveLength(2);
    expect(
      planMutationsForTask({
        document: updated,
        attachments: {},
        mutations,
      }).patches,
    ).toEqual([]);
    expect(() =>
      planMutationsForTask({
        document: updated,
        attachments: {},
        mutations: [
          {
            kind: "setTaskDeleted",
            mutationID: mutationID("wrong-task"),
            taskID: "another-task" as TaskID,
            isDeleted: true,
          },
        ],
      }),
    ).toThrow("different task document");
    expect(() =>
      planMutationsForTask({
        document: updated,
        attachments: {},
        mutations: [
          {
            kind: "updateTaskSpec",
            mutationID: mutationID("components"),
            taskID,
            spec: clozeSpec(),
          },
        ],
      }),
    ).toThrow("cannot change component IDs");
  });

  test("cloze membership and order edits retain raw histories, including late reviews", () => {
    const document = decodePerTaskVaultTask({
      documentType: "com.withorbit.vault-task",
      schemaVersion: 2,
      vaultID: "cloze-edits" as VaultID,
      taskID,
      task: encodeTask({
        createdAtTimestampMillis: 1_000,
        spec: clozeSpec(["a", "b"]),
        provenance: null,
        metadata: {},
        isDeleted: false,
      }),
      observations: {},
    });
    const envelope = {
      vaultID: document.vaultID,
      createdAtTimestampMillis: 1_000,
      scheduler: defaultOrbitSchedulerPolicy,
      attachments: {},
    };
    function plan(
      current: typeof document,
      mutations: Parameters<typeof planMutationsForTask>[0]["mutations"],
    ) {
      return planMutationsForTask({
        document: current,
        attachments: {},
        mutations,
      });
    }
    function update(
      ids: string[],
    ): Extract<VaultMutation, { kind: "updateTaskSpec" }> {
      return {
        kind: "updateTaskSpec",
        mutationID: mutationID(ids.join("/")),
        taskID,
        spec: clozeSpec(ids),
      };
    }
    function recall(
      id: string,
      componentID: string,
      occurredAtTimestampMillis: number,
    ): Extract<VaultMutation, { kind: "recordReview" }> {
      return {
        kind: "recordReview",
        mutationID: mutationID(id),
        observationID: observationID(id),
        taskID,
        componentID,
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis,
      };
    }
    const reviewed = plan(document, [
      recall("review-a", "a", 2_000),
      recall("review-b", "b", 3_000),
      {
        kind: "reschedule",
        mutationID: mutationID("due-b"),
        observationID: observationID("due-b"),
        taskID,
        componentID: "b",
        occurredAtTimestampMillis: 4_000,
        newDueTimestampMillis: 0,
      },
    ]).document;
    const original = projectPerTask(envelope, reviewed).tasks.get(taskID)!;
    const expanded = plan(reviewed, [update(["b", "c", "a"])]);
    expect(expanded.patches.map(({ path }) => path)).toEqual([
      ["task", "spec"],
    ]);
    expect(expanded.document.observations).toEqual(reviewed.observations);
    const added = projectPerTask(envelope, expanded.document).tasks.get(
      taskID,
    )!;
    expect(added.componentStates.a).toEqual(original.componentStates.a);
    expect(added.componentStates.b).toEqual(original.componentStates.b);
    expect(added.componentStates.c.lastRepetitionTimestampMillis).toBeNull();
    expect(added.componentStates.c.dueTimestampMillis).toBe(1_000);

    const retired = plan(expanded.document, [update(["c", "a"])]).document;
    expect(retired.observations).toEqual(reviewed.observations);
    const projection = projectPerTask(envelope, retired);
    expect(projection.issues).toEqual([]);
    expect(Object.keys(projection.tasks.get(taskID)!.componentStates)).toEqual([
      "a",
      "c",
    ]);
    const entry = derivePerTaskCatalogEntry(
      envelope,
      "automerge:cloze" as AutomergeDocumentURL,
      retired,
      ["head"],
    );
    // Retired b was due at zero; only the fresh active c can now make it due.
    expect(entry.nextDueTimestampMillis).toBe(1_000);

    const late = plan(retired, [recall("late-b", "b", 5_000)]).document;
    expect(Object.keys(late.observations)).toHaveLength(4);
    expect(projectPerTask(envelope, late).issues).toEqual([]);
    expect(
      projectPerTask(envelope, late).tasks.get(taskID)!.componentStates,
    ).toEqual(projection.tasks.get(taskID)!.componentStates);
    const restored = plan(late, [update(["c", "b", "a"])]).document;
    expect(restored.observations).toEqual(late.observations);
    const resumed = projectPerTask(envelope, restored).tasks.get(taskID)!;
    expect(resumed.componentStates.b.lastRepetitionTimestampMillis).toBe(5_000);
    expect(resumed.componentStates.a).toEqual(original.componentStates.a);
    expect(resumed.componentStates.c).toEqual(added.componentStates.c);
    expect(document.observations).toEqual({});
    const beforeRejection = structuredClone(restored);
    expect(() => plan(restored, [update([])])).toThrow(
      "cannot change component IDs",
    );
    expect(restored).toEqual(beforeRejection);
  });

  test("component changes retain conversion restrictions and reject empty clozes", () => {
    expect(
      canUpdateTaskSpecComponents(plainSpec("Old"), plainSpec("New")),
    ).toBe(true);
    expect(canUpdateTaskSpecComponents(plainSpec("Old"), clozeSpec())).toBe(
      false,
    );
    expect(canUpdateTaskSpecComponents(clozeSpec(), plainSpec("New"))).toBe(
      false,
    );
    expect(
      canUpdateTaskSpecComponents(clozeSpec(["main"]), plainSpec("New")),
    ).toBe(true);
    expect(canUpdateTaskSpecComponents(clozeSpec(), clozeSpec([]))).toBe(false);
  });
});

const taskID = "task-native-planner" as TaskID;

function history(): Exclude<VaultMutation, { kind: "registerAttachment" }>[] {
  return [
    {
      kind: "ingestTask",
      mutationID: mutationID("ingest"),
      task: {
        taskID,
        createdAtTimestampMillis: 1_000,
        spec: plainSpec("Initial"),
        provenance: null,
        metadata: {},
      },
    },
    {
      kind: "recordReview",
      mutationID: mutationID("review"),
      observationID: observationID("review"),
      taskID,
      componentID: "main",
      reviewSessionID: "session",
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 2_000,
    },
    {
      kind: "reschedule",
      mutationID: mutationID("reschedule"),
      observationID: observationID("reschedule"),
      taskID,
      componentID: "main",
      occurredAtTimestampMillis: 3_000,
      newDueTimestampMillis: 20_000,
    },
    {
      kind: "updateTaskSpec",
      mutationID: mutationID("spec"),
      taskID,
      spec: plainSpec("Edited"),
    },
    {
      kind: "mergeTaskMetadata",
      mutationID: mutationID("metadata"),
      taskID,
      metadata: { source: "typed" },
    },
    {
      kind: "setTaskDeleted",
      mutationID: mutationID("delete"),
      taskID,
      isDeleted: true,
    },
  ];
}

function plainSpec(text: string): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Plain,
      body: { text, attachments: [] },
    },
  };
}

function clozeSpec(ids = ["answer"]): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "{Answer}", attachments: [] },
      components: Object.fromEntries(
        ids.map((id, order) => [
          id,
          {
            order,
            ranges: [{ startIndex: 0, length: 8, hint: null }],
          },
        ]),
      ),
    },
  };
}

function applyPatches(
  root: Record<string, unknown>,
  patches: readonly DocumentPatch[],
) {
  for (const patch of patches) {
    let parent = root;
    for (const component of patch.path.slice(0, -1)) {
      parent = parent[component] as Record<string, unknown>;
    }
    const key = patch.path.at(-1)!;
    if (patch.kind === "delete") delete parent[key];
    else parent[key] = patch.value;
  }
}

function mutationID(value: string) {
  return `test/${value}` as VaultMutationID;
}

function observationID(value: string) {
  return `test/${value}` as ObservationID;
}
