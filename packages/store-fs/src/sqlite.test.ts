import {
  AttachmentReference,
  Entity,
  EntityType,
  EventID,
  Task,
  TaskID,
} from "@withorbit/core2";
import { core2 as testFixtures } from "@withorbit/sample-data";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
} from "@withorbit/store-shared";
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

const { createTestTask, createTestAttachmentReference } = testFixtures;

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
  await backend.modifyEntities(
    [],
    async () => new Map(entities.map((e) => [e.entity.id, e])),
  );
}

describe("round-trip entities", () => {
  test("tasks", async () => {
    await putEntities(backend, testTasks);

    const result = await backend.getEntities(["a", "c", "z"] as TaskID[]);
    expect(result).toEqual(
      new Map([
        ["a", testTasks[0]],
        ["c", testTasks[2]],
      ]),
    );
  });

  test("attachments", async () => {
    await putEntities(backend, testAttachmentReferences);
    const result = await backend.getEntities(["a_b", "a_z"] as TaskID[]);
    expect(result).toEqual(new Map([["a_b", testAttachmentReferences[1]]]));
  });
});

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
});

describe("querying entities", () => {
  beforeEach(() => {
    return putEntities(backend, [...testTasks, ...testAttachmentReferences]);
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
    expect(entities).toEqual(testTasks.slice(0, 2));
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
  "USE TEMP B-TREE FOR DISTINCT",
]
`);

    const queryWithSeek = constructListEntitySQLQuery({
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
