import { Entity, Event } from "@withorbit/core";
import { EmailSpec } from "../email/types.js";

export interface LoggingService {
  logPageView(log: PageViewLog): Promise<unknown>;
  logSessionNotification(log: SessionNotificationLog): Promise<unknown>;
  logUserEvent(log: UserEventLog): Promise<unknown>;
  logEvent(log: EventLog): Promise<unknown>;
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

export type EventLog = {
  userID: string;
  event: Event;
  entity: Entity;
};
