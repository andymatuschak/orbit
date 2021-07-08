import { Entity, EntityType, Event, EventID, TaskID } from "./core2";
import { Database } from "./database";
import { IDBDatabaseBackend } from "./database/backends/indexedDB";
import { SQLDatabaseBackend } from "./database/backends/sqlite";
// @ts-ignore Looks like there is no @types for this library
import FDBFactory from "fake-indexeddb/lib/FDBFactory";

function mockEventReducer(entitySnapshot: Entity | null, event: Event) {
  return {
    id: event.entityID,
    type: EntityType.Task,
    latestTimestampMillis: event.timestampMillis,
  } as unknown as Entity;
}

enum Backends {
  IDBDatabaseBackend = "IDBDatabaseBackend",
  SQLDatabaseBackend = "SQLDatabaseBackend",
}

const testEvents: Event[] = [
  { id: "a", entityID: "x", timestampMillis: 100 },
  { id: "b", entityID: "x", timestampMillis: 99 },
  { id: "c", entityID: "y", timestampMillis: 98 },
] as Event[];

describe.each([
  { backend: Backends.IDBDatabaseBackend },
  { backend: Backends.SQLDatabaseBackend },
])("test implementations", ({ backend }) => {
  let db: Database;

  beforeEach(() => {
    switch (backend) {
      case Backends.IDBDatabaseBackend: {
        indexedDB = new FDBFactory();
        db = new Database(new IDBDatabaseBackend(indexedDB), mockEventReducer);
        break;
      }
      case Backends.SQLDatabaseBackend: {
        db = new Database(
          new SQLDatabaseBackend(SQLDatabaseBackend.tempDBSubpath),
          mockEventReducer,
        );
        break;
      }
    }
  });

  test(`[${backend}] round-trip events`, async () => {
    await db.putEvents(testEvents);

    const result = await db.getEvents(["a", "c"] as EventID[]);
    expect(result).toEqual(
      new Map([
        ["a", testEvents[0]],
        ["c", testEvents[2]],
      ]),
    );
  });

  test(`[${backend}] updates entities`, async () => {
    await db.putEvents(testEvents);
    const entityID = "x" as TaskID;
    const results = await db.getEntities([entityID]);
    const entity = results.get(entityID);
    expect((entity as any).latestTimestampMillis).toBe(100);
  });

  describe("querying events", () => {
    beforeEach(() => db.putEvents(testEvents));

    test(`[${backend}] by entity ID`, async () => {
      const events = await db.listEvents({
        predicate: ["entityID", "=", "x"],
      });
      expect(events).toEqual([testEvents[0], testEvents[1]]);
    });

    test(`[${backend}] by entity ID and limit`, async () => {
      const events = await db.listEvents({
        predicate: ["entityID", "=", "x"],
        limit: 1,
      });
      expect(events).toEqual([testEvents[0]]);
    });

    test(`[${backend}] with after ID`, async () => {
      const events = await db.listEvents({
        afterID: "a" as EventID,
      });
      expect(events).toEqual([testEvents[1], testEvents[2]]);
    });

    test(`[${backend}] by entity ID and after ID`, async () => {
      const events = await db.listEvents({
        afterID: "a" as EventID,
        predicate: ["entityID", "=", "x"],
      });
      expect(events).toEqual([testEvents[1]]);
    });

    test(`[${backend}] by lexicographical entity ID and after ID`, async () => {
      const eventExclusive = await db.listEvents({
        afterID: "a" as EventID,
        predicate: ["entityID", ">", "x"],
      });
      expect(eventExclusive).toEqual([testEvents[2]]);

      const eventInclusive = await db.listEvents({
        afterID: "a" as EventID,
        predicate: ["entityID", ">=", "x"],
      });
      expect(eventInclusive).toEqual([testEvents[1], testEvents[2]]);
    });
  });
});
