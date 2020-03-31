import firebase from "firebase/app";
import "firebase/firestore";

import { updateCardStateForReviewMarking } from "metabook-core";
import { MetabookActionLog } from "../types/actionLog";
import { MetabookAction } from "../userClient";

export function getActionLogForAction(
  action: MetabookAction,
): MetabookActionLog {
  const newCardState = updateCardStateForReviewMarking({
    basePromptState: action.basePromptState,
    promptSpecType: action.promptTaskID.promptSpecType,
    actionOutcome: action.actionOutcome,
    reviewTimestampMillis: action.timestampMillis,
    schedule: "default", // TODO
  });

  return {
    promptTaskID: action.promptTaskID,
    sessionID: action.sessionID,
    actionOutcome: action.actionOutcome,
    timestamp: firebase.firestore.Timestamp.fromMillis(action.timestampMillis),
    baseIntervalMillis: action.basePromptState?.interval ?? null,

    nextDueTimestamp: firebase.firestore.Timestamp.fromMillis(
      newCardState.dueTimestampMillis,
    ),
    nextIntervalMillis: newCardState.interval,
    nextBestIntervalMillis: newCardState.bestInterval,
    nextNeedsRetry: newCardState.needsRetry,
  };
}
