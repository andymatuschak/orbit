import { describe, expect, test } from "bun:test";
import type { ObservationID } from "@withorbit/core";
import type { MigratedReviewExport } from "./migration/accountMigration.js";
import { selectPostMigrationReviews } from "./migrateAccount.js";

describe("selectPostMigrationReviews", () => {
  test("excludes exactly the imported observations listed in the manifest", () => {
    const reviews = [
      review("legacy/0000000000000001/imported"),
      review("review/dogfood"),
    ];

    expect(
      selectPostMigrationReviews(reviews, [
        "legacy/0000000000000001/imported" as ObservationID,
      ]).map(({ observationID }) => observationID),
    ).toEqual(["review/dogfood"]);
  });

  test("uses observation identity rather than an ID namespace", () => {
    expect(
      selectPostMigrationReviews(
        [review("import-v2/historical"), review("review/dogfood")],
        ["import-v2/historical" as ObservationID],
      ).map(({ observationID }) => observationID),
    ).toEqual(["review/dogfood"]);
  });
});

function review(
  observationID: string,
): MigratedReviewExport["reviews"][number] {
  return {
    observationID: observationID as ObservationID,
    taskID: "task",
    componentID: "main",
    reviewSessionID: "session",
    outcome: "remembered",
    occurredAtTimestampMillis: 1,
  };
}
