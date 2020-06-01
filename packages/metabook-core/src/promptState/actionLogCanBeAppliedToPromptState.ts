import { ActionLogID } from "../actionLogID";
import {
  ActionLog,
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "../types/actionLog";
import { PromptState } from "./promptState";

export default function actionLogCanBeAppliedToPromptState(
  actionLog: ActionLog,
  promptState: PromptState | null,
): boolean {
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      return true;
    case repetitionActionLogType:
    case rescheduleActionLogType:
    case updateMetadataActionLogType:
      if (promptState) {
        return (
          actionLog.parentActionLogIDs.length === 0 ||
          actionLog.parentActionLogIDs.some((parentID: ActionLogID) =>
            promptState.headActionLogIDs.includes(parentID),
          )
        );
      } else {
        return actionLog.parentActionLogIDs.length === 0;
      }
  }
}
