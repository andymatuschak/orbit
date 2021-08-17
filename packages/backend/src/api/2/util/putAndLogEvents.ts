import { Event } from "@withorbit/core2";
import { Database } from "@withorbit/store-shared";
import { getDatabase } from "../../../db";
import { FirestoreDatabaseBackend } from "../../../db/firestoreDatabaseBackend";
import { sharedLoggingService } from "../../../logging";

export async function putAndLogEvents(
  userID: string,
  events: Event[],
): Promise<void> {
  const db = getDatabase(userID);
  const eventRecords = await db.putEvents(events);

  for (const { event, entity } of eventRecords) {
    sharedLoggingService.logEvent({
      userID,
      event,
      entity,
    });
  }
}
