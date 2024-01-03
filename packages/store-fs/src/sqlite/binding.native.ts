// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a React Native  environment.

import { SQLDatabase } from "./types.js";
import { open, OPSQLiteConnection } from "@op-engineering/op-sqlite";
import CustomWebSQLDatabase from "websql/custom";

class RNSQLiteDatabase {
  private readonly _name: string;
  private readonly _db: OPSQLiteConnection;

  constructor(name: string) {
    this._name = name;
    this._db = open({ name });
  }

  exec(
    queries: CustomWebSQLDatabase.WebSQLQuery[],
    readOnly: boolean,
    callback: (err: any, results: CustomWebSQLDatabase.WebSQLResult[]) => void,
  ) {
    // TODO: check queries vs. readOnly flag
    const results = new Array<CustomWebSQLDatabase.WebSQLResult>(
      queries.length,
    );

    queries.forEach((query, i) => {
      try {
        const result = this._db.execute(query.sql, query.args);
        if (!result.rows) {
          throw new Error("SQL query failure");
        }
        results[i] = {
          insertId: result.insertId,
          rowsAffected: result.rowsAffected,
          rows: result.rows._array,
          error: undefined,
        };
      } catch (error) {
        results[i] = {
          error: error instanceof Error ? error : new Error(String(error)),
          rows: undefined,
          rowsAffected: undefined,
          insertId: undefined,
        };
      }
    });
    callback(null, results);
  }
}

const openRNSQLiteDatabase = CustomWebSQLDatabase(RNSQLiteDatabase);

export function openDatabase(subpath: string): SQLDatabase {
  return openRNSQLiteDatabase(subpath, "", "", 1);
}

// Convert a Uint8Array into the representation expected by this SQLite implementation for BLOB columns.
export function bufferToSQLBlob(bytes: Uint8Array): unknown {
  return bytes.buffer; // react-native-quick-sqlite expects an ArrayBuffer.
}
