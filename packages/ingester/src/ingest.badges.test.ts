import { afterEach, beforeEach, expect, it } from "bun:test";
import {
  defaultOrbitSchedulerPolicy,
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
import {
  BinaryPerTaskDocuments,
  MemoryAutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import {
  INGEST_ITEM_IDENTIFIER_KEY,
  ingestSources,
  planIngestion,
} from "./ingest.js";
import type {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "./ingestible.js";

const taskID = "aaaaaaaaaaaaaaaaaaaaaa" as TaskID;
const otherTaskID = "bbbbbbbbbbbbbbbbbbbbbb" as TaskID;
let store: PerTaskRepository;

beforeEach(async () => {
  store = await PerTaskRepository.createEmpty(documents(), {
    vaultID: "badge-test" as VaultID,
  });
});
afterEach(async () => store.close());

it("assigns every new item its actual created task ID and repeats it on retry", async () => {
  const incoming = source([item("new-hash", "New")]);
  const first = planIngestion([incoming], await store.getTaskDefinitions());
  const addition = first.mutations.find(
    (mutation) => mutation.kind === "ingestTask",
  )!;
  expect(first.assignments).toEqual([
    {
      sourceIdentifier: incoming.identifier,
      itemIdentifier: incoming.items[0].identifier,
      taskID: addition.task.taskID,
    },
  ]);
  await store.apply(first.mutations);
  const retry = planIngestion([incoming], await store.getTaskDefinitions());
  expect(retry.mutations).toEqual([]);
  expect(retry.assignments).toEqual(first.assignments);
});

it("returns unchanged items as assignments alongside changed items", async () => {
  await seed();
  const incoming = source([
    item("old-hash"),
    item(otherTaskID, "New", otherTaskID),
  ]);
  const result = planIngestion([incoming], await store.getTaskDefinitions());
  expect(result.assignments).toEqual([
    {
      sourceIdentifier: incoming.identifier,
      itemIdentifier: incoming.items[0].identifier,
      taskID,
    },
    {
      sourceIdentifier: incoming.identifier,
      itemIdentifier: incoming.items[1].identifier,
      taskID: otherTaskID,
    },
  ]);
  expect(result.mutations).toMatchObject([
    { kind: "ingestTask", task: { taskID: otherTaskID } },
  ]);
});

it("assigns a legacy hash move the preserved task ID, not its discarded new ID", async () => {
  await seed();
  const moved = source([item("old-hash")], "new-note");
  const result = planIngestion(
    [source([]), moved],
    await store.getTaskDefinitions(),
  );
  expect(result.assignments).toEqual([
    {
      sourceIdentifier: moved.identifier,
      itemIdentifier: moved.items[0].identifier,
      taskID,
    },
  ]);
  expect(result.mutations).toMatchObject([
    { kind: "updateTaskProvenance", taskID },
  ]);
  await store.apply(result.mutations);
  const retry = planIngestion(
    [source([]), moved],
    await store.getTaskDefinitions(),
  );
  expect(retry.assignments).toEqual(result.assignments);
  expect(retry.mutations).toEqual([]);
});

it("assigns badge adoption to the old task and repeats it after metadata changes", async () => {
  await seed();
  const incoming = source([item(taskID, "Original", taskID)]);
  const result = planIngestion([incoming], await store.getTaskDefinitions());
  expect(result.assignments).toEqual([
    {
      sourceIdentifier: incoming.identifier,
      itemIdentifier: incoming.items[0].identifier,
      taskID,
    },
  ]);
  expect(result.mutations).toMatchObject([
    { kind: "mergeTaskMetadata", taskID },
  ]);
  await store.apply(result.mutations);
  const retry = planIngestion([incoming], await store.getTaskDefinitions());
  expect(retry.assignments).toEqual(result.assignments);
  expect(retry.mutations).toEqual([]);
});

it("assigns restored deleted tasks their original IDs", async () => {
  await seed();
  await store.apply(await plan([source([])]));
  const incoming = source([item(taskID, "Original", taskID)]);
  const result = planIngestion([incoming], await store.getTaskDefinitions());
  expect(result.assignments).toEqual([
    {
      sourceIdentifier: incoming.identifier,
      itemIdentifier: incoming.items[0].identifier,
      taskID,
    },
  ]);
  expect(result.mutations).toContainEqual(
    expect.objectContaining({
      kind: "setTaskDeleted",
      taskID,
      isDeleted: false,
    }),
  );
});

for (const scheduler of ["orbit", "fsrs"] as const) {
  it(`adopts a badge and edits wording without changing ${scheduler} scheduling or history`, async () => {
    if (scheduler === "fsrs") {
      const vault = await store.readLogicalVault();
      await store.close();
      store = await PerTaskRepository.create(documents(), {
        ...vault,
        scheduler: {
          kind: "fsrs",
          version: 1,
          modelVersion: 6,
          // Fixed FSRS-6 parameters: this is a preservation test, not a calibration.
          weights: [
            0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
            1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
            1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
          ],
          requestedRetention: 0.9,
          cutoverTimestampMillis: 0,
          previousPolicy: defaultOrbitSchedulerPolicy,
        },
      });
    }
    await seed();
    const before = await store.readLogicalVault();
    const beforeState = await scheduling(taskID);
    const stamped = source([item(taskID, "Original", taskID)]);
    const adoption = await plan([stamped]);
    expect(adoption).toMatchObject([
      {
        kind: "mergeTaskMetadata",
        taskID,
        metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: taskID },
      },
    ]);
    await store.apply(adoption);

    const edited = source([item(taskID, "Reworded question", taskID)]);
    const update = await plan([edited]);
    expect(update).toMatchObject([{ kind: "updateTaskSpec", taskID }]);
    await store.apply(update);
    const after = await store.readLogicalVault();
    expect(Object.keys(after.tasks)).toEqual([taskID]);
    expect(after.tasks[taskID].spec).toEqual(edited.items[0].spec);
    expect(after.tasks[taskID].createdAtTimestampMillis).toBe(
      before.tasks[taskID].createdAtTimestampMillis,
    );
    expect(after.observations).toEqual(before.observations);
    expect(await scheduling(taskID)).toEqual(beforeState);
    if (scheduler === "fsrs") expect(beforeState.main.fsrs).toBeDefined();
    expect(await plan([edited])).toEqual([]);
  });
}

it("creates an unknown badge with exactly its authored task ID", async () => {
  const incoming = source([item(taskID, "New", taskID)]);
  const mutations = await plan([incoming]);
  expect(mutations).toMatchObject([{ kind: "ingestTask", task: { taskID } }]);
  await store.apply(mutations);
  expect(Object.keys((await store.readLogicalVault()).tasks)).toEqual([taskID]);
  expect(await plan([incoming])).toEqual([]);
});

it("uses the explicit task ID rather than a conflicting source-local item match", async () => {
  await seed();
  const incoming = source([item("old-hash", "Independent", otherTaskID)]);
  const mutations = await plan([incoming]);
  expect(mutations).toMatchObject([
    { kind: "ingestTask", task: { taskID: otherTaskID } },
    { kind: "setTaskDeleted", taskID, isDeleted: true },
  ]);
  await store.apply(mutations);
  expect(await plan([incoming])).toEqual([]);
});

for (const includeOldSource of [true, false]) {
  it(`moves a stamped task with edited wording (${includeOldSource ? "complete" : "partial"} source batch)`, async () => {
    await seed();
    const before = await store.readLogicalVault();
    const incoming = source(
      [item(taskID, "Moved and edited", taskID)],
      "new-note",
    );
    const mutations = await plan(
      includeOldSource ? [source([]), incoming] : [incoming],
    );
    expect(
      mutations.some(
        ({ kind }) => kind === "setTaskDeleted" || kind === "ingestTask",
      ),
    ).toBe(false);
    await store.apply(mutations);
    const after = await store.readLogicalVault();
    expect(after.tasks[taskID]).toMatchObject({
      provenance: { identifier: "new-note", title: "new-note" },
      isDeleted: false,
    });
    expect(after.observations).toEqual(before.observations);
    expect(await plan([incoming])).toEqual([]);
  });
}

it("rejects duplicate badges globally before returning a mutation plan", async () => {
  const incoming = [
    source([item(taskID, "One", taskID)]),
    source([item(taskID, "Two", taskID)], "other-note"),
  ];
  await expect(plan(incoming)).rejects.toThrow(
    "claimed by more than one prompt",
  );
  expect((await store.readLogicalVault()).tasks).toEqual({});
});

for (const reverse of [true, false]) {
  it(`rejects a badge and legacy prompt claiming the same task (reverse=${reverse})`, async () => {
    await seed();
    const incoming = [
      source([item("old-hash")]),
      source([item(taskID, "Edited", taskID)], "other-note"),
    ];
    await expect(plan(reverse ? incoming.reverse() : incoming)).rejects.toThrow(
      "claimed by more than one prompt",
    );
  });
}

it("restores an explicitly referenced deleted task with its original history", async () => {
  await seed();
  const before = await store.readLogicalVault();
  const beforeState = await scheduling(taskID);
  await store.apply(await plan([source([])]));
  expect((await store.readLogicalVault()).tasks[taskID].isDeleted).toBe(true);
  const incoming = source([item(taskID, "Restored wording", taskID)]);
  const mutations = await plan([incoming]);
  expect(mutations).toContainEqual(
    expect.objectContaining({
      kind: "setTaskDeleted",
      taskID,
      isDeleted: false,
    }),
  );
  await store.apply(mutations);
  expect((await store.readLogicalVault()).observations).toEqual(
    before.observations,
  );
  expect(await scheduling(taskID)).toEqual(beforeState);
  expect(await plan([incoming])).toEqual([]);
});

it("removing a badge creates a new task instead of silently retaining its identity", async () => {
  await seed();
  const before = await store.readLogicalVault();
  await store.apply(await plan([source([item(taskID, "Original", taskID)])]));
  const mutations = await plan([source([item("old-hash")])]);
  expect(mutations.map(({ kind }) => kind)).toEqual([
    "ingestTask",
    "setTaskDeleted",
  ]);
  await store.apply(mutations);
  const after = await store.readLogicalVault();
  expect(after.tasks[taskID].isDeleted).toBe(true);
  expect(
    Object.values(after.tasks).filter(({ isDeleted }) => !isDeleted),
  ).toHaveLength(1);
  expect(after.observations).toEqual(before.observations);
});

for (const provenance of [null, { identifier: "note", title: "note" }]) {
  it(`adopts a non-ingested task with ${provenance ? "existing" : "null"} provenance`, async () => {
    await store.apply([
      {
        kind: "ingestTask",
        mutationID: "manual" as VaultMutationID,
        task: {
          taskID,
          createdAtTimestampMillis: 0,
          provenance,
          metadata: {},
          spec: qa("Original"),
        },
      },
    ]);
    const incoming = source([item(taskID, "Original", taskID)]);
    await store.apply(await plan([incoming]));
    expect((await store.readLogicalVault()).tasks[taskID]).toMatchObject({
      provenance: { identifier: "note" },
      metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: taskID },
    });
    expect(await plan([incoming])).toEqual([]);
  });
}

it("rejects component-set changes before any valid item in the batch is applied", async () => {
  await seed();
  const before = await store.readLogicalVault();
  const incoming = source([
    item(otherTaskID, "Valid new task", otherTaskID),
    { ...item(taskID, "Changed type", taskID), spec: cloze(2) },
  ]);
  await expect(plan([incoming])).rejects.toThrow("cannot change component IDs");
  expect(await store.readLogicalVault()).toEqual(before);
});

for (const count of [1, 3]) {
  it(`rejects ${count === 1 ? "removing" : "adding"} cloze components`, async () => {
    await seed(cloze(2), "0");
    const incoming = source([
      { ...item(taskID, "Cloze", taskID), spec: cloze(count) },
    ]);
    await expect(plan([incoming])).rejects.toThrow(
      "cannot change component IDs",
    );
  });
}

it("updates cloze wording while retaining existing component histories", async () => {
  await seed(cloze(2), "0");
  const before = await store.readLogicalVault();
  const beforeState = await scheduling(taskID);
  const spec = cloze(2);
  spec.content.body.text = "Reworded cloze text";
  const incoming = source([{ ...item(taskID, "Cloze", taskID), spec }]);
  await store.apply(await plan([incoming]));
  expect((await store.readLogicalVault()).observations).toEqual(
    before.observations,
  );
  expect(await scheduling(taskID)).toEqual(beforeState);
});

it("compares matched legacy specs rather than silently ignoring content changes", async () => {
  await seed();
  const mutations = await plan([source([item("old-hash", "Edited")])]);
  expect(mutations).toMatchObject([{ kind: "updateTaskSpec", taskID }]);
});

for (const malformed of [
  "",
  "short",
  "x".repeat(23),
  "/".repeat(22),
  null,
  123,
]) {
  it(`rejects malformed task IDs without relying on JSON validation (${JSON.stringify(malformed)})`, async () => {
    const incoming = source([item("id", "Invalid", malformed as TaskID)]);
    await expect(plan([incoming])).rejects.toThrow("invalid task ID");
  });
}

function documents() {
  return new BinaryPerTaskDocuments(new MemoryAutomergeBinaryStorage());
}
async function plan(sources: IngestibleSource[]) {
  return ingestSources(sources, await store.getTaskDefinitions());
}
async function scheduling(id: TaskID) {
  return (await store.getTaskProjections([id])).tasks.get(id)!.componentStates;
}
async function seed(spec = qa("Original"), componentID = "main") {
  const mutations: VaultMutation[] = [
    {
      kind: "ingestTask",
      mutationID: "seed" as VaultMutationID,
      task: {
        taskID,
        createdAtTimestampMillis: 0,
        spec,
        provenance: { identifier: "note", title: "note" },
        metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: "old-hash" },
      },
    },
  ];
  for (const [index, outcome] of [
    TaskRepetitionOutcome.Remembered,
    TaskRepetitionOutcome.Forgotten,
    TaskRepetitionOutcome.Remembered,
  ].entries())
    mutations.push({
      kind: "recordReview",
      mutationID: `review-${index}` as VaultMutationID,
      observationID: `observation-${index}` as ObservationID,
      taskID,
      componentID,
      reviewSessionID: null,
      outcome,
      occurredAtTimestampMillis: (index + 1) * 86_400_000,
    });
  await store.apply(mutations);
}
function source(
  items: IngestibleItem[],
  identifier = "note",
): IngestibleSource {
  return {
    identifier: identifier as IngestibleSourceIdentifier,
    title: identifier,
    items,
  };
}
function item(
  identifier: string,
  text = "Original",
  id?: TaskID,
): IngestibleItem {
  return {
    identifier: identifier as IngestibleItemIdentifier,
    spec: qa(text),
    ...(id !== undefined ? { taskID: id } : {}),
  };
}
function qa(text: string): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text, attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  };
}
function cloze(count: number): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "Cloze text", attachments: [] },
      components: Object.fromEntries(
        Array.from({ length: count }, (_, order) => [
          String(order),
          { order, ranges: [{ startIndex: order, length: 1, hint: null }] },
        ]),
      ),
    },
  };
}
