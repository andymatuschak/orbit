// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a React Native  environment.

import { SQLDatabase } from "./types";
import "react-native-quick-sqlite";
import CustomWebSQLDatabase from "websql/custom";

class RNSQLiteDatabase {
  private readonly _name: string;

  constructor(name: string) {
    this._name = name;
    sqlite.open(name);
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
    for (const query of queries) {
      try {
        const result = sqlite.executeSql(this._name, query.sql, query.args);
        results.push({
          insertId: result.insertId,
          rowsAffected: result.rowsAffected,
          rows: result.rows._array,
          error: undefined,
        });
      } catch (error) {
        results.push({
          error,
          rows: undefined,
          rowsAffected: undefined,
          insertId: undefined,
        });
      }
    }

    callback(undefined, results);
  }
}

const openRNSQLiteDatabase = CustomWebSQLDatabase(RNSQLiteDatabase);

export function openDatabase(subpath: string): SQLDatabase {
  return openRNSQLiteDatabase(subpath);
}
