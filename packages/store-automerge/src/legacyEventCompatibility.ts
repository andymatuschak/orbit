import type { Event, ObservationID } from "@withorbit/core";

/** Preserve legacy event order in migrated observation IDs. */
export function legacyObservationID(
  eventID: Event["id"],
  sequenceNumber?: number,
): ObservationID {
  if (sequenceNumber !== undefined) {
    if (!Number.isSafeInteger(sequenceNumber) || sequenceNumber < 0) {
      throw new Error("Legacy sequence number must be a non-negative integer");
    }
    return `legacy/${String(sequenceNumber).padStart(16, "0")}/${eventID}` as ObservationID;
  }
  return `legacy/${eventID}` as ObservationID;
}
