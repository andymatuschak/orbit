import firebase from "@firebase/app";
import "@firebase/firestore";
const firestore = firebase.firestore!;

import { updateCardStateForReviewMarking } from "metabook-core";
import { MetabookActionLog } from "../types/actionLog";
import { MetabookAction } from "../userClient";

export function getActionLogForAction(
  action: MetabookAction,
  orderSeed: number,
): MetabookActionLog {
  const newCardState = updateCardStateForReviewMarking({
    baseCardState: action.baseCardState,
    cardType: action.promptType,
    generatedOrderSeed: orderSeed,
    actionOutcome: action.actionOutcome,
    reviewTimestampMillis: action.timestamp,
    schedule: "default", // TODO
  });

  return {
    promptID: action.promptID,
    sessionID: action.sessionID,
    actionOutcome: action.actionOutcome,
    timestamp: firestore.Timestamp.fromMillis(action.timestamp),
    baseIntervalMillis: action.baseCardState?.interval ?? null,

    nextDueTimestamp: firestore.Timestamp.fromMillis(newCardState.dueTime),
    nextIntervalMillis: newCardState.interval,
    nextBestIntervalMillis: newCardState.bestInterval,
    nextOrderSeed: newCardState.orderSeed,
    nextNeedsRetry: newCardState.needsRetry,
  };
}
