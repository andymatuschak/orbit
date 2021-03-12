import { ActionLog, Prompt, PromptID, PromptState } from "@withorbit/core";
import { ActionLogDocument } from "@withorbit/firebase-support";
import { EmailSpec } from "../email/types";

export interface LoggingService {
  logActionLog(log: ActionLogLog): Promise<unknown>;
  logDataRecord(log: DataRecordLog): Promise<unknown>;
  logPageView(log: PageViewLog): Promise<unknown>;
  logSessionNotification(log: SessionNotificationLog): Promise<unknown>;
  logUserEvent(log: UserEventLog): Promise<unknown>;
}

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

export type SessionNotificationLog = {
  timestamp: number;
  userID: string;
  sessionNotificationNumber: number;
  emailSpec: EmailSpec;
};

export type DataRecordLog = {
  timestamp: number;
  id: PromptID;
  record: Prompt;
};

// Unfortunate naming!
export type ActionLogLog = {
  serverTimestamp: number;
  userID: string;
  actionLog: ActionLog;
  newTaskState: PromptState;
};
