// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a Node environment.

import SQLiteDatabase from "better-sqlite3";
import { SQLDatabaseBinding, SQLResult, SQLTransaction } from "./types.js";

class NodeSQLDatabaseBinding {
  private readonly _db: SQLiteDatabase.Database;

  constructor(name: string) {
    this._db = new SQLiteDatabase(name);
  }

  async executeSql(sqlStatement: string, args?: any[]): Promise<SQLResult> {
    const statement = this._db.prepare(sqlStatement);
    const rows = statement.all(...(args ?? []));
    return { rows };
  }

  async transaction(callback: (tx: SQLTransaction) => void): Promise<void> {
    const tx = this._db.transaction(() => {
      callback({
        executeSql: (sqlStatement: string, args?: any[]): void => {
          const statement = this._db.prepare(sqlStatement);
          statement.run(...(args ?? []));
        },
      });
    });
    tx.exclusive();
  }
}

export function openDatabase(subpath: string): SQLDatabaseBinding {
  return new NodeSQLDatabaseBinding(subpath);
}

// Convert a Uint8Array into the representation expected by this SQLite implementation for BLOB columns.
export function bufferToSQLBlob(bytes: Uint8Array): unknown {
  return Buffer.from(bytes); // better-sqlite3 expects a Buffer
}
