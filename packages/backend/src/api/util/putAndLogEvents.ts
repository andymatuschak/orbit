import { Event } from "@withorbit/core";
import { sharedServerDatabase } from "../../db/index.js";
import { sharedLoggingService } from "../../logging/index.js";

export async function putAndLogEvents(
  userID: string,
  events: Event[],
): Promise<void> {
  const db = sharedServerDatabase().getUserDatabase(userID);
  const eventRecords = await db.putEvents(events);

  for (const { event, entity } of eventRecords) {
    sharedLoggingService.logEvent({
      userID,
      event,
      entity,
    });
  }
}
