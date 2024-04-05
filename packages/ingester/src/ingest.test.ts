import {
  EventID,
  EventType,
  TaskContentType,
  TaskID,
  TaskIngestEvent,
  TaskSpecType,
  TaskUpdateDeletedEvent,
  TaskUpdateProvenanceEvent,
} from "@withorbit/core";
import { OrbitStoreInMemory } from "@withorbit/store-fs";
import {
  DuplicateItemIdentifierError,
  ingestSources,
  INGEST_ITEM_IDENTIFIER_KEY,
  MissingItemIdentifierError,
} from "./ingest.js";
import {
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "./ingestible.js";

let store: OrbitStoreInMemory;
beforeEach(() => {
  store = new OrbitStoreInMemory();
});

afterEach(() => {
  store.database.close();
});

it("ingest new prompts from unknown source", async () => {
  await store.database.putEvents([
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

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskIngest);
  const event = events[0] as TaskIngestEvent;

  expect(event.provenance).toEqual({
    identifier: "source_identifier",
    title: "Brand new source",
  });
  expect(event.spec).toEqual({
    type: "memory",
    content: {
      type: "qa",
      body: { text: "Question", attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  });
});

it("ingest new prompts from known source", async () => {
  await store.database.putEvents([
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

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskIngest);
  const event = events[0] as TaskIngestEvent;

  expect(event.provenance).toEqual({
    identifier: "source_identifier",
    title: "Existing Source",
  });
  expect(event.spec).toEqual({
    type: "memory",
    content: {
      type: "qa",
      body: { text: "New Question", attachments: [] },
      answer: { text: "New Answer", attachments: [] },
    },
  });
});

it("ignores already ingested prompts", async () => {
  await store.database.putEvents([
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

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(0);
});

it("marks prompts as deleted", async () => {
  await store.database.putEvents([
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

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskUpdateDeleted);
  const event = events[0] as TaskUpdateDeletedEvent;

  expect(event.entityID).toEqual(MOCK_ENTITY_ID);
  expect(event.isDeleted).toBeTruthy();
});

it("only ingests specified sources", async () => {
  await store.database.putEvents([
    mockQATask({
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);
  // the existing source is not specified in the ingestible sources array, but
  // exists in the DB
  const sources: IngestibleSource[] = [];

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(0);
});

it("updates provenance when source metadata changes", async () => {
  const mockIngestEvent = mockQATask({
    body: "Question",
    answer: "Answer",
    provenance: { identifier: "source_identifier", title: "Existing Source" },
  });
  await store.database.putEvents([mockIngestEvent]);
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Renamed Source",
      items: [
        {
          identifier: "Question+Answer" as IngestibleItemIdentifier,
          spec: mockIngestEvent.spec,
        },
      ],
    },
  ];

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskUpdateProvenanceEvent);
  const event = events[0] as TaskUpdateProvenanceEvent;

  expect(event.entityID).toEqual(mockIngestEvent.entityID);
  expect(event.provenance).toEqual({
    identifier: "source_identifier",
    title: "Renamed Source",
  });
});

it("moves entities across sources", async () => {
  const mockIngestEvent = mockQATask({
    body: "Question",
    answer: "Answer",
    provenance: { identifier: "source_identifier", title: "Existing Source" },
  });
  await store.database.putEvents([mockIngestEvent]);
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

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskUpdateProvenanceEvent);
  const event = events[0] as TaskUpdateProvenanceEvent;

  expect(event.entityID).toEqual(mockIngestEvent.entityID);
  expect(event.provenance).toEqual({
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
  const eventsA = await ingestSources(initialSources, store);
  expect(eventsA).toHaveLength(1);
  expect(eventsA[0]).toMatchObject({
    type: EventType.TaskIngest,
    metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: "Question+Answer" },
    provenance: {
      identifier: "source_identifier",
    },
  });
  await store.database.putEvents(eventsA);

  // re-ingest same source
  const eventsB = await ingestSources(initialSources, store);
  expect(eventsB).toHaveLength(0);

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
  const eventsC = await ingestSources(sourcesWithExtraItem, store);
  expect(eventsC).toHaveLength(1);
  expect(eventsC[0]).toMatchObject({
    type: EventType.TaskIngest,
    metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: "New Question+Answer" },
    provenance: {
      identifier: "new_source_identifier",
    },
  });
  await store.database.putEvents(eventsC);

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
  const eventsD = await ingestSources(sourcesWithMovedItem, store);
  expect(eventsD).toHaveLength(1);
  expect(eventsD[0]).toMatchObject({
    type: EventType.TaskUpdateProvenanceEvent,
    provenance: {
      identifier: "source_identifier",
      title: "Existing Source",
    },
  });
  await store.database.putEvents(eventsD);

  // delete all items associated to source
  const sourcesWithDeletedItems: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing source",
      items: [],
    },
  ];
  const eventsE = await ingestSources(sourcesWithDeletedItems, store);
  expect(eventsE).toHaveLength(2);
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
    const events = await ingestSources([source], store);
    expect(events[0]).toMatchObject({
      provenance: {
        url: "/some/random/url",
      },
    });
  });

  it("uses colorPaletteName", async () => {
    const source: IngestibleSource = { ...BASE, colorPaletteName: "lime" };
    const events = await ingestSources([source], store);
    expect(events[0]).toMatchObject({
      provenance: {
        colorPaletteName: "lime",
      },
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
    await store.database.putEvents([task]);

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
    await expect(ingestSources([source], store)).rejects.toThrow(
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
    task.metadata = {};
    await store.database.putEvents([task]);
    const source: IngestibleSource = {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Source",
      items: [],
    };
    await expect(ingestSources([source], store)).rejects.toThrow(
      MissingItemIdentifierError,
    );
  });
});

// These need the following format or else the putEvents will fail the schema validation
// check for events
const MOCK_EVENT_ID = "bbbbbbbbbbbbbbbbbbbbbb";
const MOCK_ENTITY_ID = "yyyyyyyyyyyyyyyyyyyyyy";

function mockQATask(args: {
  eventID?: string;
  entityID?: string;
  body: string;
  answer: string;
  provenance: { identifier: string; title: string };
}): TaskIngestEvent {
  return {
    id: (args.eventID ?? MOCK_EVENT_ID) as EventID,
    type: EventType.TaskIngest,
    timestampMillis: 0,
    entityID: (args.entityID ?? MOCK_ENTITY_ID) as TaskID,
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
  };
}
