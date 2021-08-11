import {Event} from "@withorbit/core2";
import { Database } from "@withorbit/store-shared";
import { FirestoreDatabaseBackend } from "../../../backend/2/firestoreDatabaseBackend";

export async function putAndLogEvents(userID: string, events: Event[]): Promise<void> {
  const db = new Database(new FirestoreDatabaseBackend(userID));
  await db.putEvents(events);
  // TODO: log to BigQuery
}
