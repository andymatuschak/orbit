import { DatabaseBackendEntityRecord } from "@withorbit/store-shared";
import { IDBDatabaseBackend } from "./indexedDB";
import {
  AttachmentReference,
  EntityType,
  EventID,
  Task,
  TaskID,
} from "@withorbit/core2";
import { core2 as testFixtures } from "@withorbit/sample-data";
// @ts-ignore Looks like there is no @types for this library
import FDBFactory from "fake-indexeddb/lib/FDBFactory";

const { createTestTask, createTestAttachmentReference } = testFixtures;

let backend: IDBDatabaseBackend;

const testTasks: DatabaseBackendEntityRecord<Task>[] = [
  {
    entity: createTestTask({
      id: "a",
      dueTimestampMillis: 50,
    }),
    lastEventID: "x" as EventID,
    lastEventTimestampMillis: 5,
  },
  {
    entity: createTestTask({
      id: "b",
      dueTimestampMillis: 100,
    }),
    lastEventID: "y" as EventID,
    lastEventTimestampMillis: 4,
  },
  {
    entity: createTestTask({
      id: "c",
      dueTimestampMillis: 150,
    }),
    lastEventID: "z" as EventID,
    lastEventTimestampMillis: 3,
  },
];

const testAttachmentReferences: DatabaseBackendEntityRecord<AttachmentReference>[] =
  [
    {
      entity: createTestAttachmentReference("a_a"),
      lastEventID: "x" as EventID,
      lastEventTimestampMillis: 1000,
    },
    {
      entity: createTestAttachmentReference("a_b"),
      lastEventID: "y" as EventID,
      lastEventTimestampMillis: 1000,
    },
  ];

beforeEach(() => {
  indexedDB = new FDBFactory();
  backend = new IDBDatabaseBackend("OrbitDatabase", indexedDB);
});

describe("round-trip entities", () => {
  test("tasks", async () => {
    await backend.putEntities(testTasks);

    const result = await backend.getEntities(["a", "c", "z"] as TaskID[]);
    expect(result).toEqual(
      new Map([
        ["a", testTasks[0]],
        ["c", testTasks[2]],
      ]),
    );
  });

  test("attachments", async () => {
    await backend.putEntities(testAttachmentReferences);
    const result = await backend.getEntities(["a_b", "a_z"] as TaskID[]);
    expect(result).toEqual(new Map([["a_b", testAttachmentReferences[1]]]));
  });
});

describe("task components", () => {
  test("created on insert", async () => {
    await backend.putEntities(testTasks);

    const results = await fetchAllRowsForTable("derived_taskComponents");
    const filteredResults = results.filter(
      (component: { taskID: string }) => component.taskID == "a",
    );

    expect(filteredResults.length).toBe(2);
    expect(filteredResults[0]).toMatchInlineSnapshot(`
      Object {
        "componentID": "a",
        "dueTimestampMillis": 50,
        "taskID": "a",
      }
    `);
    expect(filteredResults[1]).toMatchInlineSnapshot(`
      Object {
        "componentID": "b",
        "dueTimestampMillis": 200,
        "taskID": "a",
      }
    `);
  });

  test("modified on update", async () => {
    await backend.putEntities(testTasks);

    const updatedTask = createTestTask({
      id: "a",
      dueTimestampMillis: 300,
    });
    delete updatedTask.componentStates["b"];
    const updatedRecord: DatabaseBackendEntityRecord<Task> = {
      entity: updatedTask,
      lastEventID: "y" as EventID,
      lastEventTimestampMillis: 20,
    };
    await backend.modifyEntities([updatedTask.id], async (entityMap) => {
      const output = new Map(entityMap);
      output.set(updatedTask.id, updatedRecord);
      return output;
    });

    const results = await fetchAllRowsForTable("derived_taskComponents");
    const filteredResults = results.filter(
      (component: { taskID: string }) => component.taskID == "a",
    );

    expect(filteredResults.length).toBe(1);
    expect(filteredResults[0]).toMatchInlineSnapshot(`
      Object {
        "componentID": "a",
        "dueTimestampMillis": 300,
        "taskID": "a",
      }
    `);
  });
});

describe("querying entities", () => {
  beforeEach(() =>
    backend.putEntities([...testTasks, ...testAttachmentReferences]),
  );
  test("limit", async () => {
    const firstEntity = await backend.listEntities({
      entityType: EntityType.Task,
      limit: 1,
    });
    expect(firstEntity.length).toBe(1);
    expect(firstEntity[0].entity.id).toBe("a");
  });

  test("after", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.Task,
      afterID: "a" as TaskID,
    });
    expect(entities.length).toBe(2);
    expect(entities[0].entity.id).toBe("b");
    expect(entities[1].entity.id).toBe("c");
  });

  test("by due timestamp", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<=", 100],
    });
    expect(entities.map((record) => record.entity.id)).toEqual(["a", "b"]);
  });

  test("by due timestamp and after ID", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.Task,
      afterID: "a" as TaskID,
      predicate: ["dueTimestampMillis", "<=", 100],
    });
    expect(entities.map((record) => record.entity.id)).toEqual(["b"]);
  });

  test("attachment references", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.AttachmentReference,
    });
    expect(entities).toEqual(testAttachmentReferences);
  });
});

async function createIndexedDBConnection(): Promise<IDBDatabase> {
  const DBOpenRequest = indexedDB.open("OrbitDatabase");
  return new Promise((resolve) => {
    DBOpenRequest.onsuccess = () => {
      resolve(DBOpenRequest.result);
    };
  });
}

async function fetchAllRowsForTable(table: string): Promise<any[]> {
  const db = await createIndexedDBConnection();
  const transaction = db.transaction(table, "readonly");
  const store = transaction.objectStore(table);
  const request = store.getAll();
  const result = await new Promise<any[]>((resolve) => {
    request.onsuccess = () => resolve(request.result);
  });
  return result;
}
