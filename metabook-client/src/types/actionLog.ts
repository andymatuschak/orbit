import firebase from "firebase";
import "firebase/firestore";

import { MetabookActionOutcome } from "metabook-core";
import { PromptTaskID } from "../util/promptTaskID";

export interface MetabookActionLog {
  promptTaskID: PromptTaskID;
  sessionID: string | null;
  timestamp: firebase.firestore.Timestamp;
  actionOutcome: MetabookActionOutcome;
  baseIntervalMillis: number | null;

  nextDueTimestamp: firebase.firestore.Timestamp;
  nextIntervalMillis: number;
  nextBestIntervalMillis: number | null;
  nextNeedsRetry: boolean;
}
