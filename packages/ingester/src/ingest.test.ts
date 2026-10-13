import {
  TaskContentType,
  TaskID,
  TaskSpecType,
  TaskRepetitionOutcome,
  type ObservationID,
  type VaultMutation,
  type VaultMutationID,
  type VaultID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  MemoryAutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";

type IngestTaskMutation = Extract<VaultMutation, { kind: "ingestTask" }>;
type DeleteTaskMutation = Extract<VaultMutation, { kind: "setTaskDeleted" }>;
type ProvenanceMutation = Extract<
  VaultMutation,
  { kind: "updateTaskProvenance" }
>;
async function reconcile(sources: IngestibleSource[]) {
  return ingestSources(sources, await store.getTaskDefinitions());
}
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  DuplicateItemIdentifierError,
  INGEST_ITEM_IDENTIFIER_KEY,
  ingestSources,
  MissingItemIdentifierError,
} from "./ingest.js";
import {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "./ingestible.js";

let store: PerTaskRepository;
beforeEach(async () => {
  store = await PerTaskRepository.createEmpty(
    new BinaryPerTaskDocuments(new MemoryAutomergeBinaryStorage()),
    { vaultID: "ingester-test" as VaultID },
  );
});

it("keeps identical prompts in different sources separate", async () => {
  const spec = mockQATask({
    body: "Same",
    answer: "Answer",
    provenance: { identifier: "first", title: "First" },
  }).task.spec;
  const sources: IngestibleSource[] = ["first", "second"].map((identifier) => ({
    identifier: identifier as IngestibleSourceIdentifier,
    title: identifier,
    items: [{ identifier: "same-content" as IngestibleItemIdentifier, spec }],
  }));
  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(2);
  await store.apply(mutations);
  expect(await reconcile(sources)).toHaveLength(0);
  const deletions = await reconcile([{ ...sources[0], items: [] }]);
  expect(deletions).toHaveLength(1);
  await store.apply(deletions);
  expect(
    (
      await store.getTaskProjections(
        Object.keys(await store.getCatalogEntries()) as TaskID[],
      )
    ).tasks.size,
  ).toBe(1);
});

it("preserves a moved prompt's ID and scheduling observations", async () => {
  const seed = mockQATask({
    body: "Question",
    answer: "Answer",
    provenance: { identifier: "old", title: "Old" },
  });
  await store.apply([
    seed,
    {
      kind: "recordReview",
      mutationID: "review-mutation" as VaultMutationID,
      observationID: "review-id" as ObservationID,
      taskID: seed.task.taskID,
      componentID: "main",
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 1000,
    },
  ]);
  const before = await store.readLogicalVault();
  const moved: IngestibleSource[] = [
    {
      identifier: "old" as IngestibleSourceIdentifier,
      title: "Old",
      items: [],
    },
    {
      identifier: "new" as IngestibleSourceIdentifier,
      title: "New",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: seed.task.spec,
        },
      ],
    },
  ];
  const mutations = await reconcile(moved);
  expect(mutations).toHaveLength(1);
  expect(mutations[0]).toMatchObject({
    kind: "updateTaskProvenance",
    taskID: seed.task.taskID,
  });
  await store.apply(mutations);
  const after = await store.readLogicalVault();
  expect(Object.keys(after.tasks)).toEqual(Object.keys(before.tasks));
  expect(after.observations).toEqual(before.observations);
  expect(after.tasks[seed.task.taskID].provenance?.title).toBe("New");
});

it("keeps the historical delete-and-create policy for edited content and re-adds", async () => {
  const seed = mockQATask({
    body: "Old",
    answer: "Answer",
    provenance: { identifier: "note", title: "Note" },
  });
  await store.apply([seed]);
  const sources: IngestibleSource[] = [
    {
      identifier: "note" as IngestibleSourceIdentifier,
      title: "Note",
      items: [
        {
          identifier: "Edited+Answer" as IngestibleItemIdentifier,
          spec: mockQATask({
            body: "Edited",
            answer: "Answer",
            provenance: { identifier: "note", title: "Note" },
          }).task.spec,
        },
      ],
    },
  ];
  const mutations = await reconcile(sources);
  expect(mutations.map(({ kind }) => kind)).toEqual([
    "ingestTask",
    "setTaskDeleted",
  ]);
  await store.apply(mutations);
  expect(
    (await store.readLogicalVault()).tasks[seed.task.taskID].isDeleted,
  ).toBe(true);
  expect(await reconcile(sources)).toHaveLength(0);
  const restored = await reconcile([
    {
      ...sources[0],
      items: [
        {
          identifier: "Old+Answer" as IngestibleItemIdentifier,
          spec: seed.task.spec,
        },
      ],
    },
  ]);
  const addition = restored.find(
    (mutation): mutation is IngestTaskMutation =>
      mutation.kind === "ingestTask",
  );
  expect(addition?.task.taskID).not.toBe(seed.task.taskID);
});

afterEach(async () => {
  await store.close();
});

it("ingest new prompts from unknown source", async () => {
  await store.apply([
    mockQATask({
      body: "Existing Question",
      answer: "Answer",
      provenance: {
        identifier: "existing_source_identifier",
        title: "Existing Source",
      },
    }),
  ]);

  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Brand new source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].kind).toBe("ingestTask");
  const mutation = mutations[0] as IngestTaskMutation;

  expect(mutation.task.provenance).toEqual({
    identifier: "source_identifier",
    title: "Brand new source",
  });
  expect(mutation.task.spec).toEqual({
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  });
});

it("ingest new prompts from known source", async () => {
  await store.apply([
    mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
        {
          identifier: "New Question+New Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "New Question", attachments: [] },
              answer: { text: "New Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].kind).toBe("ingestTask");
  const mutation = mutations[0] as IngestTaskMutation;

  expect(mutation.task.provenance).toEqual({
    identifier: "source_identifier",
    title: "Existing Source",
  });
  expect(mutation.task.spec).toEqual({
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: "New Question", attachments: [] },
      answer: { text: "New Answer", attachments: [] },
    },
  });
});

it("ignores already ingested prompts", async () => {
  await store.apply([
    mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);

  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(0);
});

it("marks prompts as deleted", async () => {
  await store.apply([
    mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);

  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].kind).toBe("setTaskDeleted");
  const mutation = mutations[0] as DeleteTaskMutation;

  expect(mutation.taskID).toEqual(MOCK_TASK_ID);
  expect(mutation.isDeleted).toBeTruthy();
});

it("only ingests specified sources", async () => {
  await store.apply([
    mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);
  // the existing source is not specified in the ingestible sources array, but
  // exists in the DB
  const sources: IngestibleSource[] = [];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(0);
});

it("updates provenance when source metadata changes", async () => {
  const seed = mockQATask({
    body: "Question",
    answer: "Answer",
    provenance: { identifier: "source_identifier", title: "Existing Source" },
  });
  await store.apply([seed]);
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Renamed Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: seed.task.spec,
        },
      ],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].kind).toBe("updateTaskProvenance");
  const mutation = mutations[0] as ProvenanceMutation;

  expect(mutation.taskID).toEqual(seed.task.taskID);
  expect(mutation.provenance).toEqual({
    identifier: "source_identifier",
    title: "Renamed Source",
  });
});

it("moves entities across sources", async () => {
  const seed = mockQATask({
    body: "Question",
    answer: "Answer",
    provenance: { identifier: "source_identifier", title: "Existing Source" },
  });
  await store.apply([seed]);
  // insert the same item identifier but with a different provenance
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [],
    },
    {
      identifier: "some_new_source_identifier" as IngestibleSourceIdentifier,
      title: "Some Fancy New Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];

  const mutations = await reconcile(sources);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].kind).toBe("updateTaskProvenance");
  const mutation = mutations[0] as ProvenanceMutation;

  expect(mutation.taskID).toEqual(seed.task.taskID);
  expect(mutation.provenance).toEqual({
    identifier: "some_new_source_identifier",
    title: "Some Fancy New Source",
  });
});

it("round trip", async () => {
  const initialSources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];

  // ingest new sources
  const mutationsA = await reconcile(initialSources);
  expect(mutationsA).toHaveLength(1);
  expect(mutationsA[0]).toMatchObject({
    kind: "ingestTask",
    task: {
      metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: "Question+Answer" },
      provenance: { identifier: "source_identifier" },
    },
  });
  await store.apply(mutationsA);

  // re-ingest same source
  const mutationsB = await reconcile(initialSources);
  expect(mutationsB).toHaveLength(0);

  // add new items to a new source
  const sourcesWithExtraItem: IngestibleSource[] = [
    {
      identifier: "new_source_identifier" as IngestibleSourceIdentifier,
      title: "Brand new source",
      items: [
        {
          identifier: "New Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "New Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];
  const mutationsC = await reconcile(sourcesWithExtraItem);
  expect(mutationsC).toHaveLength(1);
  expect(mutationsC[0]).toMatchObject({
    kind: "ingestTask",
    task: {
      metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: "New Question+Answer" },
      provenance: { identifier: "new_source_identifier" },
    },
  });
  await store.apply(mutationsC);

  // move new task to the existing source
  const sourcesWithMovedItem: IngestibleSource[] = [
    {
      identifier: "new_source_identifier" as IngestibleSourceIdentifier,
      title: "Brand new source",
      items: [],
    },
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
        {
          identifier: "New Question+Answer" as IngestibleItemIdentifier,
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text: "New Question", attachments: [] },
              answer: { text: "Answer", attachments: [] },
            },
          },
        },
      ],
    },
  ];
  const mutationsD = await reconcile(sourcesWithMovedItem);
  expect(mutationsD).toHaveLength(1);
  expect(mutationsD[0]).toMatchObject({
    kind: "updateTaskProvenance",
    provenance: {
      identifier: "source_identifier",
      title: "Existing Source",
    },
  });
  await store.apply(mutationsD);

  // delete all items associated to source
  const sourcesWithDeletedItems: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing source",
      items: [],
    },
  ];
  const mutationsE = await reconcile(sourcesWithDeletedItems);
  expect(mutationsE).toHaveLength(2);
});

describe("provenance", () => {
  const BASE: IngestibleSource = {
    identifier: "source_identifier" as IngestibleSourceIdentifier,
    title: "Brand new source",
    items: [
      {
        identifier: "Question+Answer" as IngestibleItemIdentifier,
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: "Question", attachments: [] },
            answer: { text: "Answer", attachments: [] },
          },
        },
      },
    ],
  };

  it("uses url", async () => {
    const source: IngestibleSource = { ...BASE, url: "/some/random/url" };
    const mutations = await reconcile([source]);
    expect(mutations[0]).toMatchObject({
      task: { provenance: { url: "/some/random/url" } },
    });
  });

  it("uses colorPaletteName", async () => {
    const source: IngestibleSource = { ...BASE, colorPaletteName: "lime" };
    const mutations = await reconcile([source]);
    expect(mutations[0]).toMatchObject({
      task: { provenance: { colorPaletteName: "lime" } },
    });
  });
});

describe("throws", () => {
  it("throws if two items share the same identifier", async () => {
    const task = mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: {
        identifier: "source_identifier",
        title: "Existing Source",
      },
    });
    await store.apply([task]);

    const ITEM: IngestibleItem = {
      identifier: "Question+Answer" as IngestibleItemIdentifier,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: { text: "Question", attachments: [] },
          answer: { text: "Answer", attachments: [] },
        },
      },
    };

    const source: IngestibleSource = {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Source",
      items: [{ ...ITEM }, { ...ITEM }],
    };
    await expect(reconcile([source])).rejects.toThrow(
      DuplicateItemIdentifierError("Question+Answer"),
    );
  });

  it("throws if metadata is not defined on existing task", async () => {
    const task = mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: {
        identifier: "source_identifier",
        title: "Existing Source",
      },
    });
    // remove the item identifier key
    task.task.metadata = {};
    await store.apply([task]);
    const source: IngestibleSource = {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Source",
      items: [],
    };
    await expect(reconcile([source])).rejects.toThrow(
      MissingItemIdentifierError,
    );
  });
});

// Stable fixture identities; persistence uses the real shared repository.
const MOCK_MUTATION_ID = "bbbbbbbbbbbbbbbbbbbbbb" as VaultMutationID;
const MOCK_TASK_ID = "yyyyyyyyyyyyyyyyyyyyyy" as TaskID;

function mockQATask(args: {
  mutationID?: string;
  taskID?: string;
  body: string;
  answer: string;
  provenance: { identifier: string; title: string };
}): IngestTaskMutation {
  return {
    kind: "ingestTask",
    mutationID: (args.mutationID ?? MOCK_MUTATION_ID) as VaultMutationID,
    task: {
      taskID: (args.taskID ?? MOCK_TASK_ID) as TaskID,
      createdAtTimestampMillis: 0,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: { text: args.body, attachments: [] },
          answer: { text: args.answer, attachments: [] },
        },
      },
      metadata: {
        [INGEST_ITEM_IDENTIFIER_KEY]: `${args.body}+${args.answer}`,
      },
      provenance: {
        identifier: args.provenance.identifier,
        title: args.provenance.title,
      },
    },
  };
}
