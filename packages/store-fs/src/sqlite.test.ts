import { Entity, EntityType, EventID, Task, TaskID } from "@withorbit/core";
import { createTestTask } from "@withorbit/sample-data";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "@withorbit/store-shared";
import { tmpdir } from "os";
import path from "path";
import {
  constructGetByIDSQLQuery,
  constructListEntitySQLQuery,
  constructListEventSQLQuery,
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

let backend: SQLDatabaseBackend;

beforeEach(async () => {
  backend = new SQLDatabaseBackend(SQLDatabaseBackend.tempDBSubpath);
});

test("DB automatically migrates", async () => {
  const db = await backend.__accessDBForTesting();
  expect(await getSchemaVersionNumber(db)).toBe(latestSchemaVersionNumber);
});

async function putEntities(
  backend: DatabaseBackend,
  entities: DatabaseBackendEntityRecord<Entity>[],
) {
  await backend.updateEntities(
    [],
    async () => new Map(entities.map((e) => [e.entity.id, e])),
  );
}

describe("task components", () => {
  test("created on insert", async () => {
    await putEntities(backend, testTasks);
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
        "dueTimestampMillis": 50,
        "taskID": "a",
      }
    `);
  });

  test("modified on update", async () => {
    await putEntities(backend, testTasks);

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
    await putEntities(backend, [updatedRecord]);

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

  test("removed when deleted", async () => {
    await putEntities(backend, testTasks);
    const updatedRecord: DatabaseBackendEntityRecord<Task> = {
      entity: { ...testTasks[0].entity, isDeleted: true },
      lastEventID: "y" as EventID,
      lastEventTimestampMillis: 20,
    };
    await putEntities(backend, [updatedRecord]);
    const results = await execReadStatement(
      await backend.__accessDBForTesting(),
      `SELECT * FROM derived_taskComponents WHERE taskID=? ORDER BY componentID`,
      ["a"],
    );
    expect(results.rows.length).toBe(0);
  });
});

// These tests assert that our queries use indexes as expected, i.e. rather than performing full table scans.
describe("indexing", () => {
  test("get entities by ID", async () => {
    const plan = await getQueryPlan(
      await backend.__accessDBForTesting(),
      constructGetByIDSQLQuery(
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
      constructGetByIDSQLQuery(
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
    const query = constructListEntitySQLQuery({
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
    const query = constructListEntitySQLQuery({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<=", 100],
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
  "USE TEMP B-TREE FOR DISTINCT",
]
`);

    const queryWithSeek = constructListEntitySQLQuery({
      entityType: EntityType.Task,
      predicate: ["dueTimestampMillis", "<=", 100],
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
  "USE TEMP B-TREE FOR DISTINCT",
]
`);
  });

  test("list events by entity ID", async () => {
    const query = constructListEventSQLQuery({
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

describe("20230726103155_derived_taskComponents_whenNotDeleted", () => {
  test.each([{ isDeleted: true }, { isDeleted: false }])(
    "for isDeleted = $isDeleted",
    async ({ isDeleted }) => {
      const tempPath = path.join(
        tmpdir(),
        `temp-${Date.now()}-${Math.random()}.sqlite`,
      );
      await backend.close();
      backend = new SQLDatabaseBackend(tempPath, {
        schemaVersion: 20211019170802,
      });
      await putEntities(
        backend,
        testTasks.map((record) => ({
          ...record,
          entity: { ...record.entity, isDeleted },
        })),
      );
      const oldCount = (
        await execReadStatement(
          await backend.__accessDBForTesting(),
          `SELECT * FROM derived_taskComponents`,
        )
      ).rows.length;
      await backend.close();

      backend = new SQLDatabaseBackend(tempPath);
      const results = await execReadStatement(
        await backend.__accessDBForTesting(),
        `SELECT * FROM derived_taskComponents`,
      );
      expect(results.rows.length).toBe(isDeleted ? 0 : oldCount);
    },
  );
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
