export interface UserMetadata {
  registrationTimestampMillis: number;
  activeTaskCount?: number;
  sessionNotificationState?: SessionNotificationState;
}

export interface SessionNotificationState {
  firstNotificationTimestampMillis: number;
  lastNotificationTimestampMillis: number;
  sentNotificationCount: number;
}
