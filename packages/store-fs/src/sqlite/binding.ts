// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a Node environment.

import { Database as SQLiteDatabase } from "sqlite3";
import { SQLDatabaseBinding, SQLResult, SQLTransaction } from "./types.js";

class NodeSQLDatabaseBinding {
  private readonly _name: string;
  private readonly _db: SQLiteDatabase;
  private _isOK: boolean = true;

  constructor(name: string) {
    this._name = name;
    this._db = new SQLiteDatabase(name, (err) => {
      if (err) {
        console.error("Couldn't open database", err);
        this._isOK = false;
      }
    });
  }

  private _checkStatus() {
    if (!this._isOK) {
      throw new Error(`Database not open ${this._name}`);
    }
  }

  async executeSql(sqlStatement: string, args?: any[]): Promise<SQLResult> {
    this._checkStatus();

    return new Promise((resolve, reject) => {
      this._db.all(sqlStatement, args, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            rows,
          });
        }
      });
    });
  }

  async transaction(callback: (tx: SQLTransaction) => void): Promise<void> {
    this._checkStatus();

    return new Promise((resolve, reject) => {
      this._db.serialize(() => {
        this._db.run("BEGIN TRANSACTION");
        callback({
          executeSql: (sqlStatement: string, args?: any[]): void => {
            this._db.run(sqlStatement, args);
          },
        });
        this._db.run("END TRANSACTION", (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }
}

export function openDatabase(subpath: string): SQLDatabaseBinding {
  return new NodeSQLDatabaseBinding(subpath);
}

// Convert a Uint8Array into the representation expected by this SQLite implementation for BLOB columns.
export function bufferToSQLBlob(bytes: Uint8Array): unknown {
  return Buffer.from(bytes); // node-sqlite3 expects a Buffer
}
