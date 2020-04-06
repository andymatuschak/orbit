import firebase from "firebase/app";
import "firebase/firestore";

import {
  MetabookActionOutcome,
  Prompt,
  PromptSpecID,
  PromptTask,
} from "metabook-core";

interface BaseActionLog {
  actionLogType: ActionLogType;
  timestamp: firebase.firestore.Timestamp;
}

const ingestActionLogType = "ingest";
export interface MetabookIngestActionLog extends BaseActionLog {
  actionLogType: typeof ingestActionLogType;
  prompt: Prompt;
}

const reviewActionLogType = "review";
export interface MetabookReviewActionLog extends BaseActionLog {
  actionLogType: typeof reviewActionLogType;
  promptTask: PromptTask;

  sessionID: string | null;
  actionOutcome: MetabookActionOutcome;
  baseIntervalMillis: number | null;

  nextDueTimestamp: firebase.firestore.Timestamp;
  nextIntervalMillis: number;
  nextBestIntervalMillis: number | null;
  nextNeedsRetry: boolean;
}

export type MetabookActionLog =
  | MetabookIngestActionLog
  | MetabookReviewActionLog;

export type ActionLogType = MetabookActionLog["actionLogType"];
