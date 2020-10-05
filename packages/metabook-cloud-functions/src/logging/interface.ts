export interface LogBase {
  userID: string;
  timestamp: number;
}

export type UserEventName = "registration";

export interface LoggingService {
  logUserEvent(log: LogBase & { eventName: UserEventName }): Promise<unknown>;
}
