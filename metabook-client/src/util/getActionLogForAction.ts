import firebase from "firebase/app";
import "firebase/firestore";
import { getIDForPrompt, updatePromptStateForAction } from "metabook-core";
import { repetitionActionLogType } from "metabook-core/dist/types/actionLog";

import { MetabookReviewAction } from "../userClient";
import { RepetitionActionLog } from "metabook-core";

export function getActionLogForAction(
  action: MetabookReviewAction,
): RepetitionActionLog {
  const newCardState = updatePromptStateForAction({
    basePromptState: action.basePromptState,
    prompt: action.prompt,
    actionOutcome: action.actionOutcome,
    reviewTimestampMillis: action.timestampMillis,
    schedule: "default", // TODO
  });

  return {
    parentActionLogIDs: [], // TODO
    actionLogType: repetitionActionLogType,
    promptID: getIDForPrompt(action.prompt),
    promptParameters: action.promptParameters,
    promptTaskParameters: action.promptTaskParameters,

    sessionID: action.sessionID,
    actionOutcome: action.actionOutcome,
    timestampMillis: action.timestampMillis,
  };
}
