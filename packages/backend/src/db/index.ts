import { Database } from "@withorbit/store-shared";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend";

function getDatabase(userID: string): Database {
  return new Database(new FirestoreDatabaseBackend(userID));
}
