import { Entity, Event, EventID, IDOfEntity } from "../../core2";
import { EntityType } from "../../core2/entities/entityBase";
import {
  DatabaseEntityQuery,
  DatabaseEventQuery,
  DatabaseQueryOptions,
  DatabaseQueryPredicate,
} from "../../database";
import { DatabaseBackend, DatabaseBackendEntityRecord } from "../backend";
import { openDatabase } from "./sqlite/binding";
import { performMigration } from "./sqlite/migration";
import {
  SQLEntityTableColumn,
  SQLEventTableColumn,
  SQLTableName,
} from "./sqlite/tables";
import { execReadStatement, execTransaction } from "./sqlite/transactionUtils";
import { SQLDatabase } from "./sqlite/types";

/*

SQLite-based implementation of an Orbit database backend.

Running list of implementation problems / gotchas:
1. expo-sqlite doesn't support a real close() operation[1]. A few implications:
  a. opening/closing many databases in a React Native context will leak resources
  b. clients can't know exactly when all writes are complete--but I don't think that's relevant in practice
  c. the database must be run in WAL mode at all times to avoid iOS killing us for holding a database lock while suspended

2. Our transaction primitives don't give us enough control to safely isolate schema migration. Simultaneous migrations could occur in the context of multiple processes accessing the same database, or multiple instances in the same process reading the same database. In practice, this probably won't cause corruption: most likely the migration transaction will simply fail in one process. But in the future complex migrations could partially succeed. At some point we should consider flock()ing during migration.

[1] https://github.com/expo/expo/issues/2278
 */

export class SQLDatabaseBackend implements DatabaseBackend {
  private _db: SQLDatabase | null;
  private readonly _migrationPromise: Promise<void>;

  constructor(subpath: string) {
    this._db = openDatabase(subpath);
    this._migrationPromise = performMigration(this._db);
  }
  static inMemoryDBSubpath = ":memory:"; // Pass to constructor to create an in-memory database
  static tempDBSubpath = ""; // Pass to constructor to create a temporary database file

  async close(): Promise<void> {
    await this._ensureDB();
    this._db = null;
    // Warning: we have no way to ensure that all writes have resolved before resolving this promise; this is a weakness in the WebSQL API (which is passed down to our implementations).
    return Promise.resolve();
  }

  getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    return this._getByID(
      SQLTableName.Entities,
      SQLEntityTableColumn.ID,
      [
        SQLEntityTableColumn.ID,
        SQLEntityTableColumn.LastEventID,
        SQLEntityTableColumn.Data,
      ],
      entityIDs,
      ({ id, lastEventID, data }) => {
        const entity: E = JSON.parse(data);
        return [id, { lastEventID, entity }];
      },
    );
  }

  putEntities(
    entityRecords: DatabaseBackendEntityRecord<Entity>[],
  ): Promise<void> {
    return this._put(
      SQLTableName.Entities,
      "REPLACE",
      [
        SQLEntityTableColumn.ID,
        SQLEntityTableColumn.LastEventID,
        SQLEntityTableColumn.Data,
      ],
      entityRecords.map((record) => [
        record.entity.id,
        record.lastEventID,
        JSON.stringify(record.entity),
      ]),
    );
  }

  getEvents<E extends Event, ID extends EventID>(
    eventIDs: EventID[],
  ): Promise<Map<ID, E>> {
    return this._getByID(
      SQLTableName.Events,
      SQLEventTableColumn.ID,
      [SQLEventTableColumn.ID, SQLEventTableColumn.Data],
      eventIDs,
      ({ data, id }) => {
        const event: E = JSON.parse(data);
        return [id, event];
      },
    );
  }

  putEvents(events: Event[]): Promise<void> {
    return this._put(
      SQLTableName.Events,
      "INSERT",
      [
        SQLEventTableColumn.ID,
        SQLEventTableColumn.EntityID,
        SQLEventTableColumn.Data,
      ],
      events.map((event) => [event.id, event.entityID, JSON.stringify(event)]),
    );
  }

  async listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]> {
    if (query.entityType !== EntityType.Task) {
      // Haven't actually added this column to the DB; we can do that when it's needed.
      throw new Error(`Unsupported entity type in query: ${query.entityType}`);
    }

    const sqlQuery = constructEntitySQLQuery(query);
    const results = await execReadStatement(
      await this._ensureDB(),
      sqlQuery.statement,
      sqlQuery.args,
    );
    const output: DatabaseBackendEntityRecord<E>[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      output.push({
        lastEventID: row[SQLEntityTableColumn.LastEventID],
        entity: JSON.parse(row[SQLEntityTableColumn.Data]),
      });
    }
    return output;
  }

  async listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    const sqlQuery = constructEventSQLQuery(query);
    const results = await execReadStatement(
      await this._ensureDB(),
      sqlQuery.statement,
      sqlQuery.args,
    );

    const output: Event[] = [];
    for (let i = 0; i < results.rows.length; i++) {
      const row = results.rows.item(i);
      output.push(JSON.parse(row[SQLEventTableColumn.Data]));
    }
    return output;
  }

  private async _put(
    tableName: SQLTableName,
    verb: "REPLACE" | "INSERT",
    columnNames: string[],
    rows: unknown[][],
  ): Promise<void> {
    const db = await this._ensureDB();
    await execTransaction(db, (tx) => {
      const placeholderString = rows
        .map((row) => `(${row.map(() => "?").join(",")})`)
        .join(",");
      tx.executeSql(
        `${verb} INTO ${tableName} (${columnNames.join(
          ",",
        )}) VALUES ${placeholderString}`,
        rows.flat(),
      );
    });
  }

  private async _getByID<ID extends string, Column extends string, Output>(
    tableName: SQLTableName,
    idColumnName: string,
    columnNames: Column[],
    ids: ID[],
    rowMapping: (row: { [C in Column]: any }) => [id: ID, value: Output],
  ): Promise<Map<ID, Output>> {
    const db = await this._ensureDB();
    const resultSet = await execReadStatement(
      db,
      constructByIDSQLQuery(tableName, idColumnName, columnNames, ids),
      ids,
    );
    const { rows } = resultSet;

    const output: Map<ID, Output> = new Map();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const [id, value] = rowMapping(rows.item(rowIndex));
      output.set(id, value);
    }
    return output;
  }

  private async _ensureDB(): Promise<SQLDatabase> {
    if (this._db) {
      await this._migrationPromise;
      return this._db;
    } else {
      throw new Error("Attempting to access database after it's been cloesd");
    }
  }

  async __accessDBForTesting(): Promise<SQLDatabase> {
    return this._ensureDB();
  }
}

export function constructEntitySQLQuery<E extends Entity>(
  query: DatabaseEntityQuery<E>,
): { statement: string; args: any[] } {
  if (query.predicate?.[0] === "dueTimestampMillis") {
    // Special case using the derived_taskComponents index table.
    return constructSQLQuery({
      tableExpression: `derived_taskComponents AS dt JOIN ${SQLTableName.Entities} AS e ON (dt.taskID = e.${SQLEntityTableColumn.ID})`,
      idKey: SQLEntityTableColumn.ID,
      orderKey: SQLEntityTableColumn.RowID,
      columns: [SQLEntityTableColumn.LastEventID, SQLEntityTableColumn.Data],
      options: query,
      predicate: query.predicate,
    });
  } else {
    return constructSQLQuery({
      tableExpression: SQLTableName.Entities,
      idKey: SQLEntityTableColumn.ID,
      orderKey: SQLEntityTableColumn.RowID,
      columns: [SQLEntityTableColumn.LastEventID, SQLEntityTableColumn.Data],
      options: query,
      predicate: query.predicate,
    });
  }
}

export function constructEventSQLQuery(query: DatabaseEventQuery): {
  statement: string;
  args: any[];
} {
  return constructSQLQuery({
    tableExpression: SQLTableName.Events,
    idKey: SQLEventTableColumn.ID,
    orderKey: SQLEventTableColumn.SequenceNumber,
    columns: [SQLEventTableColumn.Data],
    options: query,
    predicate: query.predicate,
  });
}

export function constructSQLQuery({
  tableExpression,
  idKey,
  orderKey,
  columns,
  options,
  predicate,
}: {
  tableExpression: SQLTableName | string;
  idKey: string;
  orderKey: string;
  columns: string[];
  options: DatabaseQueryOptions<any>;
  predicate?: DatabaseQueryPredicate<any, any>;
}): { statement: string; args: any[] } {
  const args: any[] = [];

  const whereExpressions: string[] = [];
  if (predicate) {
    whereExpressions.push(`${predicate[0]} ${predicate[1]} ?`);
    args.push(predicate[2]);
  }

  if (options.afterID) {
    whereExpressions.push(
      `${orderKey} > (SELECT ${orderKey} FROM ${tableExpression} WHERE ${idKey}=?)`,
    );
    args.push(options.afterID);
  }

  const whereClause =
    whereExpressions.length > 0
      ? `WHERE ${whereExpressions.join(" AND ")}`
      : "";
  const limitClause =
    options.limit === undefined ? "" : `LIMIT ${options.limit}`;

  const query = `SELECT ${columns.join(
    ",",
  )} FROM ${tableExpression} ${whereClause} ${limitClause}`;
  return { statement: query, args };
}

export function constructByIDSQLQuery<Column, ID>(
  tableName: SQLTableName,
  idColumnName: string,
  columnNames: Column[],
  ids: ID[],
) {
  return `SELECT ${columnNames.join(
    ",",
  )} FROM ${tableName} WHERE ${idColumnName} IN (${ids
    .map(() => `?`)
    .join(",")})`;
}
