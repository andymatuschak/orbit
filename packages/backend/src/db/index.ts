import { Database } from "@withorbit/store-shared";
import { FirestoreDatabaseBackend } from "./firestoreDatabaseBackend.js";
import * as accounts from "./firebaseAccountData.js";
import * as auth from "./firebaseAuth.js";

// Currently there's only a Firestore / Firebase Auth-based implementation.
interface OrbitServerDatabase {
  getUserDatabase(userID: string): Database;
  accounts: typeof import("./firebaseAccountData.js");
  auth: typeof import("./firebaseAuth.js");
}

let _sharedServerDatabase: OrbitServerDatabase | null = null;
export function sharedServerDatabase(): OrbitServerDatabase {
  if (!_sharedServerDatabase) {
    _sharedServerDatabase = {
      getUserDatabase(userID: string): Database {
        return new Database(new FirestoreDatabaseBackend(userID));
      },
      accounts,
      auth,
    };
  }
  return _sharedServerDatabase;
}
