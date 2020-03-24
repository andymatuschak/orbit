import firebase from "firebase";
import "firebase/firestore";

import { MetabookActionOutcome } from "metabook-core";

export interface MetabookActionLog {
  promptID: string;
  sessionID: string | null;
  timestamp: firebase.firestore.Timestamp;
  actionOutcome: MetabookActionOutcome;
  baseIntervalMillis: number | null;

  nextDueTimestamp: firebase.firestore.Timestamp;
  nextIntervalMillis: number;
  nextBestIntervalMillis: number | null;
  nextNeedsRetry: boolean;
  nextOrderSeed: number;
}
