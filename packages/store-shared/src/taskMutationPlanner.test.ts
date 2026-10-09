import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type ObservationID,
  type TaskID,
  type TaskSpec,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import { decodePerTaskVaultTask } from "./perTaskCodec.js";
import { encodeTask, planMutationsForTask } from "./taskMutationPlanner.js";
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

function clozeSpec(): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "{Answer}", attachments: [] },
      components: {
        answer: {
          order: 0,
          ranges: [{ startIndex: 0, length: 8, hint: null }],
        },
      },
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
