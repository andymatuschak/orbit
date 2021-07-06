import { EntityType } from "../dist/core2/entityBase";
import { Entity, Event, EventID, TaskID } from "./core2";
import { Database } from "./database";
import { SQLDatabaseBackend } from "./database/backends/sqlite";

let db: Database;

beforeEach(() => {
  db = new Database(
    new SQLDatabaseBackend(SQLDatabaseBackend.tempDBSubpath),
    (entitySnapshot, event) =>
      ({
        id: event.entityID,
        type: EntityType.Task,
        latestTimestampMillis: event.timestampMillis,
      } as unknown as Entity),
  );
});

const testEvents: Event[] = [
  { id: "a", entityID: "x", timestampMillis: 100 },
  { id: "b", entityID: "x", timestampMillis: 99 },
  { id: "c", entityID: "y", timestampMillis: 98 },
] as Event[];

test("round-trip events", async () => {
  await db.putEvents(testEvents);

  const result = await db.getEvents(["a", "c"] as EventID[]);
  expect(result).toEqual(
    new Map([
      ["a", testEvents[0]],
      ["c", testEvents[2]],
    ]),
  );
});

test("updates entities", async () => {
  await db.putEvents(testEvents);
  const entityID = "x" as TaskID;
  const results = await db.getEntities([entityID]);
  const entity = results.get(entityID);
  expect((entity as any).latestTimestampMillis).toBe(100);
});

describe("querying events", () => {
  beforeEach(() => db.putEvents(testEvents));

  test("by entity ID", async () => {
    const events = await db.listEvents({
      predicate: ["entityID", "=", "x"],
    });
    expect(events).toEqual([testEvents[0], testEvents[1]]);
  });
});
