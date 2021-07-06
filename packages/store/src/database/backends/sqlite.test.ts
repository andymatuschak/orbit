import { AttachmentMimeType } from "@withorbit/core";
import { EventID, Task, TaskID } from "../../core2";
import {
  AttachmentReference,
  AttachmentID,
} from "../../core2/entities/attachmentReference";
import { EntityType } from "../../core2/entities/entityBase";
import { testTask } from "../__tests__/testTasks";
import { DatabaseBackendEntityRecord } from "../backend";
import {
  constructByIDSQLQuery,
  constructEntitySQLQuery,
  constructEventSQLQuery,
  SQLDatabaseBackend,
} from "./sqlite";
import { getSchemaVersionNumber } from "./sqlite/migration";
import { latestSchemaVersionNumber } from "./sqlite/migrations";
import {
  SQLEntityTableColumn,
  SQLEventTableColumn,
  SQLTableName,
} from "./sqlite/tables";
import { execReadStatement } from "./sqlite/transactionUtils";
import { SQLDatabase } from "./sqlite/types";

let backend: SQLDatabaseBackend;

beforeEach(async () => {
  backend = new SQLDatabaseBackend(SQLDatabaseBackend.tempDBSubpath);
});

test("DB automatically migrates", async () => {
  const db = await backend.__accessDBForTesting();
  expect(await getSchemaVersionNumber(db)).toBe(latestSchemaVersionNumber);
});

function createTestTask({
  id,
  lastEventID,
  dueTimestampMillis,
}: {
  id: string;
  lastEventID: string;
  dueTimestampMillis: number;
}): DatabaseBackendEntityRecord<Task> {
  // lazy deep clone
  const newTask = JSON.parse(JSON.stringify(testTask)) as Task;
  newTask.id = id as TaskID;
  newTask.componentStates["a"].dueTimestampMillis = dueTimestampMillis;
  return { entity: newTask, lastEventID: lastEventID as EventID };
}

function createTestAttachmentReference(
  id: string,
  lastEventID: string,
): DatabaseBackendEntityRecord<AttachmentReference> {
  return {
    lastEventID: lastEventID as EventID,
    entity: {
      id: id as AttachmentID,
      type: EntityType.AttachmentReference,
      mimeType: AttachmentMimeType.PNG,
    },
  };
}

const testTasks: DatabaseBackendEntityRecord<Task>[] = [
  createTestTask({ id: "a", lastEventID: "x", dueTimestampMillis: 50 }),
  createTestTask({ id: "b", lastEventID: "y", dueTimestampMillis: 100 }),
  createTestTask({ id: "c", lastEventID: "z", dueTimestampMillis: 150 }),
];

const testAttachmentReferences: DatabaseBackendEntityRecord<AttachmentReference>[] =
  [
    createTestAttachmentReference("a_a", "x"),
    createTestAttachmentReference("a_b", "y"),
  ];

describe("round-trip entities", async () => {
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
    const results = await execReadStatement(
      await backend.__accessDBForTesting(),
      `SELECT * FROM derived_taskComponents WHERE taskID=? ORDER BY componentID`,
      ["a"],
    );
    expect(results.rows.length).toBe(2);
    expect(results.rows.item(0)).toMatchInlineSnapshot(`
      Object {
        "componentID": "a",
        "dueTimestampMillis": 50,
        "taskID": "a",
      }
    `);
    expect(results.rows.item(1)).toMatchInlineSnapshot(`
      Object {
        "componentID": "b",
        "dueTimestampMillis": 200,
        "taskID": "a",
      }
    `);
  });

  test("modified on update", async () => {
    await backend.putEntities(testTasks);

    const updatedA = createTestTask({
      id: "a",
      lastEventID: "y",
      dueTimestampMillis: 300,
    });
    delete updatedA.entity.componentStates["b"];
    await backend.putEntities([updatedA]);

    const results = await execReadStatement(
      await backend.__accessDBForTesting(),
      `SELECT * FROM derived_taskComponents WHERE taskID=? ORDER BY componentID`,
      ["a"],
    );
    expect(results.rows.length).toBe(1);
    expect(results.rows.item(0)).toMatchInlineSnapshot(`
      Object {
        "componentID": "a",
        "dueTimestampMillis": 300,
        "taskID": "a",
      }
    `);
  });
});

describe("querying entities", () => {
  beforeEach(() => {
    return backend.putEntities([...testTasks, ...testAttachmentReferences]);
  });
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

  test("tasks by due timestamp", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<=", 100],
    });
    expect(entities.map((record) => record.entity.id)).toEqual(["a", "b"]);
  });

  test("attachment references", async () => {
    const entities = await backend.listEntities({
      entityType: EntityType.AttachmentReference,
    });
    expect(entities).toEqual(testAttachmentReferences);
  });
});

// These tests assert that our queries use indexes as expected, i.e. rather than performing full table scans.
describe("indexing", () => {
  test("get entities by ID", async () => {
    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      constructByIDSQLQuery(
        SQLTableName.Entities,
        SQLEntityTableColumn.ID,
        [SQLEntityTableColumn.Data],
        ["test"],
      ),
    );
    expect(plan).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE entities USING INDEX sqlite_autoindex_entities_1 (id=?)",
      ]
    `);
  });

  test("get events by ID", async () => {
    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      constructByIDSQLQuery(
        SQLTableName.Events,
        SQLEventTableColumn.ID,
        [SQLEventTableColumn.Data],
        ["test"],
      ),
    );
    expect(plan).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE events USING INDEX sqlite_autoindex_events_1 (id=?)",
      ]
    `);
  });

  test("list entities", async () => {
    const query = constructEntitySQLQuery({
      entityType: EntityType.Task,
      afterID: "x" as TaskID,
    });

    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      query.statement,
      query.args,
    );
    expect(plan).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE entities USING INDEX entities_type (entityType=? AND rowid>?)",
        "SCALAR SUBQUERY 1",
        "SEARCH TABLE entities USING COVERING INDEX sqlite_autoindex_entities_1 (id=?)",
      ]
    `);
  });

  test("list tasks by due timestamp", async () => {
    const query = constructEntitySQLQuery({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<", 100],
    });

    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      query.statement,
      query.args,
    );
    expect(plan).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE derived_taskComponents AS dt USING INDEX derived_taskComponents_dueTimestampMillis (dueTimestampMillis<?)",
        "SEARCH TABLE entities AS e USING INDEX sqlite_autoindex_entities_1 (id=?)",
      ]
    `);

    const queryWithSeek = constructEntitySQLQuery({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<", 100],
      afterID: "x" as TaskID,
    });

    const planWithSeek = await getQueryPlan(
      await backend.__accessDBForTesting(),
      queryWithSeek.statement,
      queryWithSeek.args,
    );
    expect(planWithSeek).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE derived_taskComponents AS dt USING INDEX derived_taskComponents_dueTimestampMillis (dueTimestampMillis<?)",
        "SEARCH TABLE entities AS e USING INDEX sqlite_autoindex_entities_1 (id=? AND rowid>?)",
        "SCALAR SUBQUERY 1",
        "SEARCH TABLE entities AS e USING COVERING INDEX sqlite_autoindex_entities_1 (id=?)",
        "SEARCH TABLE derived_taskComponents AS dt USING COVERING INDEX sqlite_autoindex_derived_taskComponents_1 (taskID=?)",
      ]
    `);
  });

  test("list events by entity ID", async () => {
    const query = constructEventSQLQuery({
      predicate: ["entityID", "=", "x"],
      afterID: "d" as EventID,
    });

    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      query.statement,
      query.args,
    );
    expect(plan).toMatchInlineSnapshot(`
      Array [
        "SEARCH TABLE events USING INDEX events_entityID (entityID=? AND rowid>?)",
        "SCALAR SUBQUERY 1",
        "SEARCH TABLE events USING COVERING INDEX sqlite_autoindex_events_1 (id=?)",
      ]
    `);
  });
});

async function getQueryPlan(db: SQLDatabase, statement: string, args?: any[]) {
  return new Promise((resolve, reject) => {
    // HACK: Relying on internals of node-websql because it won't naturally let us run EXPLAIN QUERY PLAN (which is not in the WebSQL standard).
    // @ts-ignore
    db._db._db.all(
      "EXPLAIN QUERY PLAN " + statement,
      args,
      // @ts-ignore
      (error, rows) => {
        if (error) {
          reject(error);
        } else {
          resolve(rows.map(({ detail }: { detail: string }) => detail));
        }
      },
    );
  });
}
