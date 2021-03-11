import {
  applicationPromptType,
  qaPromptType,
  getIDForPromptTask,
  PromptID,
  PromptProvenanceType,
} from "..";
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
  taskID: getIDForPromptTask({
    promptType: qaPromptType,
    promptParameters: null,
    promptID: "asdkjlf" as PromptID,
  }),
  provenance: null,
};

let basicIngestLogID: ActionLogID;
beforeAll(async () => {
  basicIngestLogID = await getIDForActionLog(basicIngestLog);
});

test("ingest logs", async () => {
  expect(basicIngestLogID).toMatchInlineSnapshot(
    `"z4EBG9j8tvxbLajdBNWT7C5k38LxcKdF8gX9tY33y6485Tdxu2e"`,
  );

  const withMetadataID = await getIDForActionLog({
    ...basicIngestLog,
    provenance: {
      provenanceType: PromptProvenanceType.Anki,
      externalID: "id",
      modificationTimestampMillis: null,
      title: null,
      url: null,
    },
  });
  expect(withMetadataID).toMatchInlineSnapshot(
    `"z4EBG9j7GuxQ8TBpugpjqgfvbVh3p9dJELJQs3zyyjgryAUaoB2"`,
  );
  expect(basicIngestLogID).not.toEqual(withMetadataID);
});

test("action logs", async () => {
  const testActionLog: RepetitionActionLog = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 0,
    taskID: getIDForPromptTask({
      promptType: applicationPromptType,
      promptParameters: null,
      promptID: "asdkjlf" as PromptID,
    }),
    taskParameters: { variantIndex: 3 },
    parentActionLogIDs: [],
    context: "testSession",
    outcome: "remembered",
  };

  const noParentActionLogID = await getIDForActionLog(testActionLog);
  const parentActionLogID = await getIDForActionLog({
    ...testActionLog,
    parentActionLogIDs: [
      "zdj7WgK8RzKsuDK4THX4ed2RpGDxXmyyFnVbtKw2RJ3YcSESN" as ActionLogID,
    ],
  });

  expect(noParentActionLogID).toMatchInlineSnapshot(
    `"z4EBG9jGAdPaPJaRoqTTcRLnQGTRC6prz5xnra3GEUBtrD8YPgk"`,
  );
  expect(parentActionLogID).toMatchInlineSnapshot(
    `"z4EBG9jHAMErbLR14FRfPfDdisUhGNapTTfbgS1ZVEVLuMT89bA"`,
  );

  expect(noParentActionLogID).not.toEqual(parentActionLogID);
});

test("update metadata", async () => {
  const testDeletion: UpdateMetadataActionLog = {
    actionLogType: updateMetadataActionLogType,
    taskID: basicIngestLog.taskID,
    parentActionLogIDs: [basicIngestLogID],
    timestampMillis: 0,
    updates: { isDeleted: true },
  };
  const testDeletionID = await getIDForActionLog(testDeletion);
  const testUndeletionID = await getIDForActionLog({
    ...testDeletion,
    updates: { isDeleted: false },
  });
  expect(testDeletionID).toMatchInlineSnapshot(
    `"z4EBG9jAiiMwim3Y1qWXHZBQftbrzVr4xxWJY6a44b72AATwhkg"`,
  );
  expect(testUndeletionID).toMatchInlineSnapshot(
    `"z4EBG9jCrrFb5Xs85H5wxZN4iJP9pd3wU2zyfvySBC5HZXniE17"`,
  );
  expect(testDeletionID).not.toEqual(testUndeletionID);
});
