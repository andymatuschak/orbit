import { Event } from "@withorbit/core2";
import { getDatabase } from "../../../db";
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
