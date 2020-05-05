import { ActionLogID } from "../actionLogID";
import {
  ingestActionLogType,
  repetitionActionLogType,
} from "../types/actionLog";
import { PromptActionLog } from "../types/promptActionLog";
import { PromptTaskParameters } from "../types/promptTaskParameters";
import { PromptState } from "./promptState";

export default function promptActionLogCanBeAppliedToPromptState(
  promptActionLog: PromptActionLog<PromptTaskParameters>,
  promptState: PromptState | null,
) {
  switch (promptActionLog.actionLogType) {
    case ingestActionLogType:
      return true;
    case repetitionActionLogType:
      if (promptState) {
        return (
          promptActionLog.parentActionLogIDs.length === 0 ||
          promptActionLog.parentActionLogIDs.some((parentID: ActionLogID) =>
            promptState.headActionLogIDs.includes(parentID),
          )
        );
      } else {
        return promptActionLog.parentActionLogIDs.length === 0;
      }
  }
}
