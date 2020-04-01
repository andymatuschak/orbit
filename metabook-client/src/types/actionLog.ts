import firebase from "firebase/app";
import "firebase/firestore";

import { MetabookActionOutcome, PromptTask } from "metabook-core";

export interface MetabookActionLog {
  promptTask: PromptTask;

  sessionID: string | null;
  timestamp: firebase.firestore.Timestamp;
  actionOutcome: MetabookActionOutcome;
  baseIntervalMillis: number | null;

  nextDueTimestamp: firebase.firestore.Timestamp;
  nextIntervalMillis: number;
  nextBestIntervalMillis: number | null;
  nextNeedsRetry: boolean;
}
