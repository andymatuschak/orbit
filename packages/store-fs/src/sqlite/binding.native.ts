// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a React Native environment.

import * as OPSQLite from "@op-engineering/op-sqlite";
import type { DB, SQLBatchTuple } from "@op-engineering/op-sqlite";
import { SQLDatabaseBinding, SQLResult, SQLTransaction } from "./types.js";

class RNSQLiteDatabase implements SQLDatabaseBinding {
  private readonly _name: string;
  private readonly _db: DB;

  constructor(name: string) {
    this._name = name;
    // OP-SQLite's ESM declarations currently use extensionless internal
    // re-exports, so NodeNext cannot see this runtime export directly.
    const { open } = OPSQLite as typeof OPSQLite & {
      open(options: { name: string }): DB;
    };
    this._db = open({ name });
  }

  async executeSql(sqlStatement: string, args?: any[]): Promise<SQLResult> {
    const result = await this._db.execute(sqlStatement, args);
    return {
      rows: result.rows,
    };
  }

  async transaction(callback: (tx: SQLTransaction) => void): Promise<void> {
    const statements: SQLBatchTuple[] = [];
    callback({
      executeSql: (sqlStatement: string, args?: any[]): void => {
        if (args) {
          statements.push([sqlStatement, args]);
        } else {
          statements.push([sqlStatement]);
        }
      },
    });

    if (statements.length > 0) {
      await this._db.executeBatch(statements);
    }
  }
}

export function openDatabase(subpath: string): SQLDatabaseBinding {
  return new RNSQLiteDatabase(subpath);
}

// Convert a Uint8Array into the representation expected by this SQLite implementation for BLOB columns.
export function bufferToSQLBlob(bytes: Uint8Array): unknown {
  return bytes;
}
