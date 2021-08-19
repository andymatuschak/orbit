export interface UserMetadata {
  registrationTimestampMillis: number;
  activeTaskCount?: number;

  sessionNotificationState?: SessionNotificationState;
  isUnsubscribedFromSessionNotifications?: boolean;
  snoozeSessionNotificationsUntilTimestampMillis?: number;

  coreMigrationTimestampMillis?: number;
}

export interface SessionNotificationState {
  firstNotificationTimestampMillis: number;
  lastNotificationTimestampMillis: number;
  sentNotificationCount: number;
}
