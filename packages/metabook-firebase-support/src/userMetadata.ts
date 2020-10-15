import { ServerTimestamp } from "./libraryAbstraction";

export interface UserMetadata<Timestamp extends ServerTimestamp> {
  registrationTimestamp: Timestamp;
  notificationState?: UserNotificationState<Timestamp>;
}

export interface UserNotificationState<Timestamp extends ServerTimestamp> {
  // TODO;
}
