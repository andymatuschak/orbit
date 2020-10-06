import admin from "firebase-admin";
import { PromptState } from "metabook-core";
import { ActionLogDocument } from "metabook-firebase-support";

export type LogBase = {
  userID: string;
  timestamp: number;
};

export type RegistrationLog = LogBase & {
  eventName: "registration";
  emailAddress: string;
};
export type UserEventLog = RegistrationLog;
export type UserEventName = UserEventLog["eventName"];

export interface LoggingService {
  logUserEvent(log: UserEventLog): Promise<unknown>;
  logActionLog(
    userID: string,
    actionLog: ActionLogDocument<admin.firestore.Timestamp>,
    newTaskState: PromptState,
  ): Promise<unknown>;
}
