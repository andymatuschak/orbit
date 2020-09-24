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
    `"z4EBG9j73xpQcJ7BgMZgwcdAx1rasEc1daTrH9ivqhwfpEm9bv8"`,
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
    `"z4EBG9jBBs3qeJH5MkYEsajaf4LoLjpkfByotGmn2gge9SV4HVc"`,
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
    `"z4EBG9j6r8EuU75f5iYpenqBRyCVRdD9k6FoPqW5izwqe4aB6xP"`,
  );
  expect(parentActionLogID).toMatchInlineSnapshot(
    `"z4EBG9j1uLize3F3LSa6WMGPYHWBFpA12y5Xd9FrjoSonFZU2CC"`,
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
    `"z4EBG9jCCSwj2S1FDM8PhqcAPU8ds6odCx3HcpkQ7FCw2HgMhog"`,
  );
  expect(testUndeletionID).toMatchInlineSnapshot(
    `"z4EBG9j8cceH7RQn72vzYvZVJRDnRrLgwsgbVYJk1QQeLZfpdpW"`,
  );
  expect(testDeletionID).not.toEqual(testUndeletionID);
});
