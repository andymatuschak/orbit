// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a Node environment.

// Note: we're not actually using WebSQL here. This is just a SQLite adapter which presents the simplified WebSQL API, convenient for unifying the two platforms' interfaces.
import webSQLOpenDatabase from "websql";
import { SQLDatabase } from "./types";

export function openDatabase(subpath: string): SQLDatabase {
  return webSQLOpenDatabase(subpath, "", "", 1);
}
