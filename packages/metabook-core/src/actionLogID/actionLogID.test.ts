import {
  IngestActionLog,
  ingestActionLogType,
  RepetitionActionLog,
  repetitionActionLogType,
} from "../types/actionLog";
import { ActionLogID, getIDForActionLog } from "./actionLogID";

test("ingest logs", () => {
  const withoutMetadataLog: IngestActionLog = {
    actionLogType: ingestActionLogType,
    timestampMillis: 0,
    taskID: "test",
    metadata: null,
  };
  const withoutMetadataID = getIDForActionLog(withoutMetadataLog);
  expect(withoutMetadataID).toMatchInlineSnapshot(
    `"zdj7WgK8RzKsuDK4THX4ed2RpGDxXmyyFnVbtKw2RJ3YcSESN"`,
  );

  const withMetadataID = getIDForActionLog({
    ...withoutMetadataLog,
    metadata: { test: 3 },
  });
  expect(withMetadataID).toMatchInlineSnapshot(
    `"zdj7WdK5hE3wmUdpfboMfmkFm8qmdoJYmqBF3BoqhueNy5Qw4"`,
  );
  expect(withoutMetadataID).not.toEqual(withMetadataID);
});

test("action logs", () => {
  const testActionLog: RepetitionActionLog = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 0,
    taskID: "test",
    taskParameters: { variantIndex: 3 },
    parentActionLogIDs: [],
    context: "testSession",
    outcome: "remembered",
  };

  const noParentActionLogID = getIDForActionLog(testActionLog);
  const parentActionLogID = getIDForActionLog({
    ...testActionLog,
    parentActionLogIDs: [
      "zdj7WgK8RzKsuDK4THX4ed2RpGDxXmyyFnVbtKw2RJ3YcSESN" as ActionLogID,
    ],
  });

  expect(noParentActionLogID).toMatchInlineSnapshot(
    `"zdj7WYA8UdWSuZwNJVKGvwTnhhJ84Tmr4ByVUTffvadRuTKP7"`,
  );
  expect(parentActionLogID).toMatchInlineSnapshot(
    `"zdj7WZiZrerunQBk43fp4RTYSdBDEWeU23j2nE9jn91Bd237m"`,
  );

  expect(noParentActionLogID).not.toEqual(parentActionLogID);
});
