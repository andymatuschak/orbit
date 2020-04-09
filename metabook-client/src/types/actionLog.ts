import firebase from "firebase/app";
import "firebase/firestore";

import {
  MetabookActionOutcome,
  PromptParameters,
  PromptSpecID,
  PromptTaskParameters,
} from "metabook-core";

interface BaseActionLog {
  actionLogType: ActionLogType;
  timestamp: firebase.firestore.Timestamp;
}

const ingestActionLogType = "ingest";
export interface MetabookIngestActionLog extends BaseActionLog {
  actionLogType: typeof ingestActionLogType;
  promptSpecID: PromptSpecID;
  promptParameters: PromptParameters
}

const reviewActionLogType = "review";
export interface MetabookReviewActionLog extends BaseActionLog {
  actionLogType: typeof reviewActionLogType;
  promptSpecID: PromptSpecID;
  promptParameters: PromptParameters;
  promptTaskParameters: PromptTaskParameters;

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
