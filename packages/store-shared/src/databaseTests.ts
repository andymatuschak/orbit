import { AttachmentMimeType } from "@withorbit/core";
import {
  AttachmentID,
  AttachmentIngestEvent,
  Entity,
  EntityType,
  Event,
  EventID,
  eventReducer,
  EventType,
  Task,
  TaskID,
  TaskIngestEvent,
} from "@withorbit/core2";
import { core2 as fixtures } from "@withorbit/sample-data";
import { Database, EventReducer } from "./database";

const { testTask } = fixtures;

// n.b. these tests are not actually run as part of this package: they're run in the implementation packages.

function mockEventReducer(entitySnapshot: Entity | null, event: Event): Entity {
  return {
    ...fixtures.testTask,
    id: event.entityID,
    eventIDs: entitySnapshot
      ? [...(entitySnapshot as any).eventIDs, event.id]
      : [event.id],
  } as Entity;
}

const testEvents: Event[] = [
  { id: "a", entityID: "x", timestampMillis: 100 },
  { id: "b", entityID: "x", timestampMillis: 90 },
  { id: "c", entityID: "y", timestampMillis: 95 },
] as Event[];

export function runDatabaseTests(
  name: string,
  databaseFactory: (eventReducer: EventReducer) => Promise<Database>,
) {
  let db: Database;
  beforeEach(async () => {
    db = await databaseFactory(mockEventReducer);
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
        db = await databaseFactory(eventReducer);
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
        expect(entities[0].id).toBe("a");
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

const testTaskEvents: Event[] = [
  ...createTestTaskEvents("a", [50, 300], 5),
  ...createTestTaskEvents("b", [100, 100], 4),
  ...createTestTaskEvents("c", [150, 150], 3),
];

const testAttachmentEvents: AttachmentIngestEvent[] = [
  {
    id: "a_a_ingest" as EventID,
    entityID: "a_a" as AttachmentID,
    type: EventType.AttachmentIngest,
    timestampMillis: 1000,
    mimeType: AttachmentMimeType.PNG,
  },
  {
    id: "b_a_ingest" as EventID,
    entityID: "b_a" as AttachmentID,
    type: EventType.AttachmentIngest,
    timestampMillis: 5000,
    mimeType: AttachmentMimeType.PNG,
  },
];
