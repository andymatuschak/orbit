import firebase from "firebase/app";
import "firebase/firestore";
import { getIDForPromptSpec, updatePromptStateForAction } from "metabook-core";

import { MetabookReviewActionLog } from "../types/actionLog";
import { MetabookReviewAction } from "../userClient";

export function getActionLogForAction(
  action: MetabookReviewAction,
): MetabookReviewActionLog {
  const newCardState = updatePromptStateForAction({
    basePromptState: action.basePromptState,
    promptSpec: action.promptSpec,
    actionOutcome: action.actionOutcome,
    reviewTimestampMillis: action.timestampMillis,
    schedule: "default", // TODO
  });

  return {
    actionLogType: "review",
    promptSpecID: getIDForPromptSpec(action.promptSpec),
    promptParameters: action.promptParameters,
    promptTaskParameters: action.promptTaskParameters,

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
