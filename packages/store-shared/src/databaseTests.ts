import {
  AttachmentID,
  AttachmentIngestEvent,
  AttachmentMIMEType,
  Entity,
  EntityID,
  EntityType,
  Event,
  EventID,
  eventReducer,
  EventType,
  Task,
  TaskID,
  TaskIngestEvent,
} from "@withorbit/core";
import { testTask } from "@withorbit/sample-data";
import { Database, EventReducer } from "./database.js";
import { AjvEventsValidator } from "./validation/AjvEventsValidator.js";
import { EventsValidator } from "./validation/eventsValidator.js";

// n.b. these tests are not actually run as part of this package: they're run in the implementation packages.

function mockEventReducer(entitySnapshot: Entity | null, event: Event): Entity {
  return {
    ...testTask,
    id: event.entityID,
    eventIDs: entitySnapshot
      ? [...(entitySnapshot as any).eventIDs, event.id]
      : [event.id],
  } as Entity;
}

const mockValidator: EventsValidator = {
  validateEvents: () => true,
};

const testEvents = [
  { id: "a", entityID: "x", timestampMillis: 100 },
  { id: "b", entityID: "x", timestampMillis: 90 },
  { id: "c", entityID: "y", timestampMillis: 95 },
] as Event[];

export function runDatabaseTests(
  name: string,
  databaseFactory: (
    eventReducer: EventReducer,
    mockValidator: EventsValidator,
  ) => Promise<Database>,
  runMetadataTests = true, // We don't implement this DB backend feature for Firebase.
) {
  let db: Database;

  beforeEach(async () => {
    db = await databaseFactory(mockEventReducer, mockValidator);
  });

  afterEach(async () => {
    await db.close();
  });

  describe(`${name} database tests`, () => {
    test(`round-trip events`, async () => {
      await db.putEvents(testEvents);

      const result = await db.getEvents(["a", "c"] as EventID[]);
      expect(result).toEqual(
        new Map([
          ["a", testEvents[0]],
          ["c", testEvents[2]],
        ]),
      );
    });

    test("empty event list doesn't explode", async () => {
      await db.putEvents([]);
    });

    test("put duplicate events", async () => {
      await db.putEvents(testEvents);
      await db.putEvents([
        { id: "e", entityID: "y", timestampMillis: 105 } as Event,
        ...testEvents,
        { id: "d", entityID: "y", timestampMillis: 90 } as Event,
      ]);

      const allEvents = await db.listEvents({});
      expect(allEvents.length).toEqual(testEvents.length + 2);
    });

    test(`updates entities`, async () => {
      await db.putEvents(testEvents);
      const entityID = "x" as TaskID;
      let results = await db.getEntities([entityID]);
      let entity = results.get(entityID);
      expect((entity as any).eventIDs).toEqual(["b", "a"]);

      // Out-of-order event:
      await db.putEvents([
        { id: "z", entityID: "x", timestampMillis: 94 } as Event,
      ]);
      results = await db.getEntities([entityID]);
      entity = results.get(entityID);
      expect((entity as any).eventIDs).toEqual(["b", "z", "a"]);

      // Fast-forward event:
      await db.putEvents([
        { id: "q", entityID: "x", timestampMillis: 110 } as Event,
      ]);
      results = await db.getEntities([entityID]);
      entity = results.get(entityID);
      expect((entity as any).eventIDs).toEqual(["b", "z", "a", "q"]);
    });

    test("doesn't write events which fail to apply", async () => {
      const db = await databaseFactory(eventReducer, mockValidator);
      await expect(
        db.putEvents([
          {
            type: EventType.TaskUpdateDeleted,
            entityID: "zz" as TaskID,
            id: "fail" as EventID,
            timestampMillis: 100,
            isDeleted: true,
          },
        ]),
      ).rejects.toBeInstanceOf(Error);

      const events = await db.getEvents(["fail" as EventID]);
      expect(events.size).toBe(0);
    });

    test("events with same timestamp are combined with original order", async () => {
      const entityID = "x" as EntityID;
      await db.putEvents([
        { id: "b", entityID, timestampMillis: 100 },
        { id: "a", entityID, timestampMillis: 100 },
      ] as Event[]);
      const resultMap = await db.getEntities([entityID]);
      const entity = resultMap.get(entityID)!;
      expect((entity as any).eventIDs).toEqual(["b", "a"]);
    });

    test(`maintains entity ordering`, async () => {
      await db.putEvents(testEvents);
      const initialEntities = await db.listEntities({
        entityType: EntityType.Task,
      });

      await db.putEvents([
        { id: "z", entityID: "x", timestampMillis: 94 } as Event,
      ]);
      const modifiedEntities = await db.listEntities({
        entityType: EntityType.Task,
      });
      expect(modifiedEntities.map(({ id }) => id)).toEqual(
        initialEntities.map(({ id }) => id),
      );
    });

    if (runMetadataTests) {
      describe("metadata", () => {
        test("round-trips", async () => {
          const testValues = new Map([
            ["foo", "bar"],
            ["baz", "bat"],
          ]);
          await db.setMetadataValues(testValues);
          const result = await db.getMetadataValues(["foo", "baz", "quux"]);
          expect(result.size).toEqual(2);
          expect(result).toMatchObject(testValues);
        });

        test("overwrites old values", async () => {
          await db.setMetadataValues(new Map([["foo", "bar"]]));
          await db.setMetadataValues(new Map([["foo", "baz"]]));
          const result = await db.getMetadataValues(["foo"]);
          expect(result.size).toEqual(1);
          expect(result.get("foo")).toEqual("baz");
        });

        test("missing values are null", async () => {
          const result = await db.getMetadataValues(["test"]);
          expect(result.size).toEqual(0);
        });

        test("deleting value", async () => {
          await db.setMetadataValues(new Map([["foo", "bar"]]));
          await db.setMetadataValues(new Map([["foo", null]]));
          const result = await db.getMetadataValues(["foo"]);
          expect(result.size).toEqual(0);
        });
      });
    }

    describe("querying events", () => {
      beforeEach(() => db.putEvents(testEvents));

      test(`by entity ID`, async () => {
        const events = await db.listEvents({
          predicate: ["entityID", "=", "x"],
        });
        expect(events).toEqual([testEvents[0], testEvents[1]]);
      });

      test(`by entity ID and limit`, async () => {
        const events = await db.listEvents({
          predicate: ["entityID", "=", "x"],
          limit: 1,
        });
        expect(events).toEqual([testEvents[0]]);
      });

      test(`with after ID`, async () => {
        const events = await db.listEvents({
          afterID: "a" as EventID,
        });
        expect(events).toEqual([testEvents[1], testEvents[2]]);
      });

      test(`by entity ID and after ID`, async () => {
        const events = await db.listEvents({
          afterID: "a" as EventID,
          predicate: ["entityID", "=", "x"],
        });
        expect(events).toEqual([testEvents[1]]);
      });
    });

    describe("querying entities", () => {
      // These tests use the real Orbit event reducer.
      let db: Database;
      beforeEach(async () => {
        db = await databaseFactory(eventReducer, mockValidator);
        await db.putEvents(testTaskEvents);
        await db.putEvents(testAttachmentEvents);
      });

      afterEach(async () => {
        await db.close();
      });

      test("get tasks by ID", async () => {
        const result = await db.getEntities(["a", "c", "z"] as TaskID[]);
        expect(result.size).toBe(2);
        expect(result.has("a" as TaskID)).toBe(true);
        expect(result.has("c" as TaskID)).toBe(true);
        expect(result.has("z" as TaskID)).toBe(false);

        const aTask = result.get("a" as TaskID)! as Task;
        expect(aTask.type).toBe(EntityType.Task);
        expect(aTask.spec).toEqual((testTaskEvents[0] as TaskIngestEvent).spec);
        expect(aTask.isDeleted).toBe(false);
        expect(aTask.componentStates["a"].createdAtTimestampMillis).toEqual(
          testTaskEvents[0].timestampMillis,
        );
      });

      test("get attachments by ID", async () => {
        const result = await db.getEntities(["a_a", "z_a"] as AttachmentID[]);
        expect(result.size).toBe(1);
        expect(result.has("a_a" as AttachmentID)).toBe(true);
        expect(result.has("z_a" as AttachmentID)).toBe(false);
      });

      test("limit", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          limit: 1,
        });
        expect(entities.length).toBe(1);
        expect(entities[0].id).toBe("q");
      });

      test("after", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          afterID: "a" as TaskID,
        });
        expect(entities.length).toBe(2);
        expect(entities[0].id).toBe("b");
        expect(entities[1].id).toBe("c");
      });

      test("tasks by due timestamp", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          predicate: ["dueTimestampMillis", "<=", 100],
        });
        expect(entities.length).toBe(2);
        expect(entities[0].id).toBe("a");
        expect(entities[1].id).toBe("b");
      });

      test("tasks by due timestamp, limit", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          limit: 1,
          predicate: ["dueTimestampMillis", "<=", 100],
        });
        expect(entities.length).toBe(1);
        expect(entities[0].id).toBe("a");
      });

      test("tasks by due timestamp, afterID", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          afterID: "a" as TaskID,
          predicate: ["dueTimestampMillis", "<=", 150],
        });
        expect(entities.length).toBe(2);
        expect(entities[0].id).toBe("b");
        expect(entities[1].id).toBe("c");
      });

      test("tasks by due timestamp, afterID, limit", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.Task,
          afterID: "a" as TaskID,
          limit: 1,
          predicate: ["dueTimestampMillis", "<=", 150],
        });
        expect(entities.length).toBe(1);
        expect(entities[0].id).toBe("b");
      });

      test("attachment references", async () => {
        const entities = await db.listEntities({
          entityType: EntityType.AttachmentReference,
        });
        expect(entities.length).toBe(2);
        expect(entities[0].id).toBe("a_a");
        expect(entities[1].id).toBe("b_a");
      });
    });

    describe("validation", () => {
      // These tests use the real Orbit event validator
      let db: Database;

      beforeEach(async () => {
        db = await databaseFactory(eventReducer, new AjvEventsValidator());
      });

      afterEach(async () => {
        await db.close();
      });

      test("rejects non-array events", async () => {
        // @ts-expect-error
        const input = { someNonArrayType: true } as Event[];

        await expect(db.putEvents(input)).rejects.toEqual({
          errors: [{ message: "#/type must be array" }],
        });
      });

      test("rejects invalid events", async () => {
        const invalidTestEvents = [...createTestTaskEvents("a", [50, 300], 5)];
        await expect(db.putEvents(invalidTestEvents)).rejects.toBeDefined();
      });

      test("accepts valid input", async () => {
        await expect(
          db.putEvents(transformTestEventsToHaveValidIDs(testTaskEvents)),
        ).resolves.toBeDefined();
      });
    });
  });
}

function createTestTaskEvents(
  taskID: string,
  componentDueTimestampsMillis: [number, number],
  eventTimestampMillis: number,
): Event[] {
  return [
    {
      id: `${taskID}_event_ingest` as EventID,
      type: EventType.TaskIngest,
      timestampMillis: eventTimestampMillis,
      entityID: taskID as TaskID,
      spec: testTask.spec,
      provenance: null,
    },
    {
      id: `${taskID}_event_reschedule_a` as EventID,
      type: EventType.TaskReschedule,
      componentID: "a",
      timestampMillis: eventTimestampMillis,
      newDueTimestampMillis: componentDueTimestampsMillis[0],
      entityID: taskID as TaskID,
    },
    {
      id: `${taskID}_event_reschedule_b` as EventID,
      type: EventType.TaskReschedule,
      componentID: "b",
      timestampMillis: eventTimestampMillis,
      newDueTimestampMillis: componentDueTimestampsMillis[1],
      entityID: taskID as TaskID,
    },
  ];
}

function transformTestEventsToHaveValidIDs(events: Event[]): Event[] {
  // IDs must be at least 22 characters long
  const EVENT_ID_LENGTH = 22;
  const createValidID = (str: string): string => {
    const missingCharsAsZeros = Array(EVENT_ID_LENGTH - str.length + 1).join(
      "0",
    );
    return `${str}${missingCharsAsZeros}` as EventID;
  };
  return events.map(
    (event) =>
      ({
        ...event,
        id: createValidID(event.id),
        entityID: createValidID(event.entityID),
      } as Event),
  );
}

const testTaskEvents: Event[] = [
  ...createTestTaskEvents("q", [50, 300], 5),
  ...createTestTaskEvents("a", [50, 300], 5),
  ...createTestTaskEvents("b", [100, 100], 4),
  ...createTestTaskEvents("c", [150, 150], 3),
  // ensure that deleted tasks don't show up in due timestamp listing
  {
    type: EventType.TaskUpdateDeleted,
    entityID: "q" as TaskID,
    id: "zzz" as EventID,
    isDeleted: true,
    timestampMillis: 150,
  },
];

const testAttachmentEvents: AttachmentIngestEvent[] = [
  {
    id: "a_a_ingest" as EventID,
    entityID: "a_a" as AttachmentID,
    type: EventType.AttachmentIngest,
    timestampMillis: 1000,
    mimeType: AttachmentMIMEType.PNG,
  },
  {
    id: "b_a_ingest" as EventID,
    entityID: "b_a" as AttachmentID,
    type: EventType.AttachmentIngest,
    timestampMillis: 5000,
    mimeType: AttachmentMIMEType.PNG,
  },
];
