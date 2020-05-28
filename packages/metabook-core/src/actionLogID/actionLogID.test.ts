import {
  IngestActionLog,
  ingestActionLogType,
  RepetitionActionLog,
  repetitionActionLogType,
  UpdateMetadataActionLog,
  updateMetadataActionLogType,
} from "../types/actionLog";
import { ActionLogID, getIDForActionLog } from "./actionLogID";

const basicIngestLog: IngestActionLog = {
  actionLogType: ingestActionLogType,
  timestampMillis: 0,
  taskID: "test",
  provenance: null,
};
const basicIngestLogID = getIDForActionLog(basicIngestLog);
test("ingest logs", () => {
  expect(basicIngestLogID).toMatchInlineSnapshot(
    `"zdj7WgK8RzKsuDK4THX4ed2RpGDxXmyyFnVbtKw2RJ3YcSESN"`,
  );

  const withMetadataID = getIDForActionLog({
    ...basicIngestLog,
    provenance: {
      provenanceType: "test",
      externalID: "id",
      modificationTimestampMillis: null,
      title: null,
      url: null,
    },
  });
  expect(withMetadataID).toMatchInlineSnapshot(
    `"zdj7WVRyTTqRHfU6P88K6baGCuXqyvTpYGgz79CRu9QFZqTP2"`,
  );
  expect(basicIngestLogID).not.toEqual(withMetadataID);
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

test("update metadata", () => {
  const testDeletion: UpdateMetadataActionLog = {
    actionLogType: updateMetadataActionLogType,
    taskID: "test",
    parentActionLogIDs: [basicIngestLogID],
    timestampMillis: 0,
    updates: { isDeleted: true },
  };
  const testDeletionID = getIDForActionLog(testDeletion);
  const testUndeletionID = getIDForActionLog({
    ...testDeletion,
    updates: { isDeleted: false },
  });
  expect(testDeletionID).toMatchInlineSnapshot(
    `"zdj7WYVQKnePYzXDuKqBys764N7fz7dXAvWGEZhKEjNVn45CL"`,
  );
  expect(testUndeletionID).toMatchInlineSnapshot(
    `"zdj7WZrjyT5iDrL2oofoF1FmGd6Dofio4TJgHueuyXmVWVAek"`,
  );
  expect(testDeletionID).not.toEqual(testUndeletionID);
});
