import {
  EventID,
  EventType,
  TaskContentType,
  TaskID,
  TaskIngestEvent,
  TaskSpecType,
  TaskUpdateDeletedEvent,
} from "@withorbit/core";
import { OrbitStoreInMemory } from "@withorbit/store-fs";
import { ingestSources } from "./ingest";
import { IngestibleSource, IngestibleSourceIdentifier } from "./ingestible";

let store: OrbitStoreInMemory;
beforeEach(() => {
  store = new OrbitStoreInMemory();
});

afterEach(() => {
  store.database.close();
});

it("ingest new prompts from unknown source", async () => {
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Brand new source",
      prompts: [
        { type: "qa", body: { text: "Question" }, answer: { text: "Answer" } },
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
      eventID: "aaaaaaaaaaaaaaaaaaaaaa",
      entityID: "xxxxxxxxxxxxxxxxxxxxxx",
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);
  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      prompts: [
        {
          type: "qa",
          body: { text: "Question" },
          answer: { text: "Answer" },
        },
        {
          type: "qa",
          body: { text: "New Question" },
          answer: { text: "New Answer" },
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
      eventID: "aaaaaaaaaaaaaaaaaaaaaa",
      entityID: "xxxxxxxxxxxxxxxxxxxxxx",
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);

  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      prompts: [
        {
          type: "qa",
          body: { text: "Question" },
          answer: { text: "Answer" },
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
      eventID: "aaaaaaaaaaaaaaaaaaaaaa",
      entityID: "xxxxxxxxxxxxxxxxxxxxxx",
      body: "Question",
      answer: "Answer",
      provenance: { identifier: "source_identifier", title: "Existing Source" },
    }),
  ]);

  const sources: IngestibleSource[] = [
    {
      identifier: "source_identifier" as IngestibleSourceIdentifier,
      title: "Existing Source",
      prompts: [],
    },
  ];

  const events = await ingestSources(sources, store);
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe(EventType.TaskUpdateDeleted);
  const event = events[0] as TaskUpdateDeletedEvent;

  expect(event.entityID).toEqual("xxxxxxxxxxxxxxxxxxxxxx");
  expect(event.isDeleted).toBeTruthy();
});

it("only ingests specified sources", async () => {
  await store.database.putEvents([
    mockQATask({
      eventID: "aaaaaaaaaaaaaaaaaaaaaa",
      entityID: "xxxxxxxxxxxxxxxxxxxxxx",
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

function mockQATask(args: {
  eventID: string;
  entityID: string;
  body: string;
  answer: string;
  provenance: { identifier: string; title: string };
}): TaskIngestEvent {
  return {
    id: args.eventID as EventID,
    type: EventType.TaskIngest,
    timestampMillis: 0,
    entityID: args.entityID as TaskID,
    spec: {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.QA,
        body: { text: args.body, attachments: [] },
        answer: { text: args.answer, attachments: [] },
      },
    },
    provenance: {
      identifier: args.provenance.identifier,
      title: args.provenance.title,
    },
  };
}
