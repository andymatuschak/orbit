// This file and databaseBinding.ts provide a unified binding for the external SQLite database APIs we use on those platforms.
// This file supplies the implementation used when running in a React Native  environment.

import * as SQLite from "expo-sqlite";
import { SQLDatabase } from "./types";

export function openDatabase(subpath: string): SQLDatabase {
  return SQLite.openDatabase(subpath, "", "", 1);
}
