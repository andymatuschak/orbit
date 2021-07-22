import { Entity, EntityType, Event, EventID, TaskID } from "@withorbit/core2";
import { Database, EventReducer } from "./database";
import { core2 as fixtures } from "@withorbit/sample-data";

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

      test(`by lexicographical entity ID and after ID`, async () => {
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
}
