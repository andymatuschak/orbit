import { PromptID } from "../promptID";
import {
  ingestActionLogType,
  RepetitionActionLog,
  repetitionActionLogType,
} from "../types/actionLog";
import { ActionLogID, getIDForActionLog } from "./actionLogID";

test("ingest logs", () => {
  expect(
    getIDForActionLog({
      actionLogType: ingestActionLogType,
      timestampMillis: 0,
      taskID: "test",
    }),
  ).toMatchInlineSnapshot(
    `"zdj7WgK8RzKsuDK4THX4ed2RpGDxXmyyFnVbtKw2RJ3YcSESN"`,
  );
});

test("action logs", () => {
  const testActionLog: RepetitionActionLog = {
    actionLogType: repetitionActionLogType,
    timestampMillis: 0,
    taskID: "test",
    taskParameters: null,
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
    `"zdj7WhUtpKgUPmJGSxWs9Ap8N3CRdQnZTcBMoy5Z7WJUg64ih"`,
  );
  expect(parentActionLogID).toMatchInlineSnapshot(
    `"zdj7WX4Rwp566AeBUN9SoFyUkLvBsbtdC8wbgJXRHhRKWzs9g"`,
  );

  expect(noParentActionLogID).not.toEqual(parentActionLogID);
});
