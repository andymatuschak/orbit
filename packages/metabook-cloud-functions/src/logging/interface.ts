import admin from "firebase-admin";
import { PromptState } from "metabook-core";
import { ActionLogDocument } from "metabook-firebase-support";

export type LogBase = {
  userID: string;
  timestamp: number;
};

export type UserEventLog = LogBase & { eventName: UserEventName };
export type UserEventName = "registration";

export interface LoggingService {
  logUserEvent(log: UserEventLog): Promise<unknown>;
  logActionLog(
    userID: string,
    log: ActionLogDocument<admin.firestore.Timestamp>,
    newTaskState: PromptState,
  ): Promise<unknown>;
}
