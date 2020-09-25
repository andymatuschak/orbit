import { ActionLogID } from "../actionLogID";
import {
  ingestActionLogType,
  repetitionActionLogType,
  rescheduleActionLogType,
  updateMetadataActionLogType,
} from "../types/actionLog";
import { PromptActionLog } from "../types/promptActionLog";
import { PromptState } from "./promptState";

export default function promptActionLogCanBeAppliedToPromptState(
  actionLog: PromptActionLog,
  promptState: PromptState | null,
): boolean {
  switch (actionLog.actionLogType) {
    case ingestActionLogType:
      // NOTE: This is appropriate in the context this function is currently used: i.e. for "fast-forward" type merges. An ingest can't be safely "fast-forwarded" on top of an existing prompt state
      return promptState === null;
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
