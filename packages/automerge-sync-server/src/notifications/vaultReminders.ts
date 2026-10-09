import { createHash } from "node:crypto";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";

/** Read only the root and current available catalog, never task histories. */
export async function readReminderCatalog(
  vault: PerTaskRepository,
  now: number,
) {
  const entries = Object.entries(await vault.getCatalogEntries()).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const fingerprint = createHash("sha256");
  let due = 0;
  // Ignore catalog identity/history so rollover and equivalent conflict
  // repairs don't restart follow-ups. Task heads detect reviews/edits;
  // timestamps here are stored due dates, not time-dependent due counts.
  for (const [taskID, entry] of entries) {
    fingerprint.update(
      JSON.stringify([
        taskID,
        [...entry.indexedTaskHeads].sort(),
        entry.nextDueTimestampMillis,
        entry.isDeleted,
      ]),
    );
    if (
      !entry.isDeleted &&
      entry.nextDueTimestampMillis !== null &&
      entry.nextDueTimestampMillis <= now
    )
      due++;
  }
  return { due, fingerprint: fingerprint.digest("hex") };
}
