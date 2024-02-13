// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a React Native environment.

import {
  open,
  OPSQLiteConnection,
  SQLBatchTuple,
} from "@op-engineering/op-sqlite";
import { SQLDatabaseBinding, SQLResult, SQLTransaction } from "./types.js";

class RNSQLiteDatabase implements SQLDatabaseBinding {
  private readonly _name: string;
  private readonly _db: OPSQLiteConnection;

  constructor(name: string) {
    this._name = name;
    this._db = open({ name });
  }

  async executeSql(sqlStatement: string, args?: any[]): Promise<SQLResult> {
    const result = await this._db.executeAsync(sqlStatement, args);
    if (!result.rows) {
      throw new Error("SQL query failure");
    }
    return {
      rows: result.rows._array,
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
      await this._db.executeBatchAsync(statements);
    }
  }
}

export function openDatabase(subpath: string): SQLDatabaseBinding {
  return new RNSQLiteDatabase(subpath);
}

// Convert a Uint8Array into the representation expected by this SQLite implementation for BLOB columns.
export function bufferToSQLBlob(bytes: Uint8Array): unknown {
  return bytes.buffer; // react-native-quick-sqlite expects an ArrayBuffer.
}
