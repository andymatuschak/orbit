import admin from "firebase-admin";
import { PromptState } from "metabook-core";
import { ActionLogDocument } from "metabook-firebase-support";

export type UserEventLogBase = {
  userID: string;
  timestamp: number;
};

export type RegistrationLog = UserEventLogBase & {
  eventName: "registration";
  emailAddress: string;
};
export type UserEventLog = RegistrationLog;
export type UserEventName = UserEventLog["eventName"];

export type PageViewLog = {
  timestamp: number;
  pathname: string;
  hostname: string;
  sessionID: string;
  referrer: string | null;
  browser: string | null;
  os: string | null;
  screen: string | null;
  language: string | null;
  device: string | null;
};

export interface LoggingService {
  logUserEvent(log: UserEventLog): Promise<unknown>;

  logActionLog(
    userID: string,
    actionLog: ActionLogDocument<admin.firestore.Timestamp>,
    newTaskState: PromptState,
  ): Promise<unknown>;

  logPageView(log: PageViewLog): Promise<unknown>;
}
