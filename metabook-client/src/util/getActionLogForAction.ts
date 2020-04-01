import firebase from "firebase/app";
import "firebase/firestore";
import {
  getIDForPromptSpec,
  PromptTask,
  updatePromptStateForAction,
} from "metabook-core";

import { MetabookActionLog } from "../types/actionLog";
import { MetabookAction } from "../userClient";

export function getActionLogForAction(
  action: MetabookAction,
): MetabookActionLog {
  const newCardState = updatePromptStateForAction({
    basePromptState: action.basePromptState,
    promptSpec: action.promptSpec,
    actionOutcome: action.actionOutcome,
    reviewTimestampMillis: action.timestampMillis,
    schedule: "default", // TODO
  });

  return {
    promptTask: {
      prompt: {
        promptSpecID: getIDForPromptSpec(action.promptSpec),
        promptParameters: action.promptParameters,
      },
      parameters: action.promptTaskParameters,
    } as PromptTask,
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
