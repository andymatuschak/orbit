import * as dateFns from "date-fns";
import { SessionNotificationState } from "metabook-firebase-support";
import { EmailSpec } from "../email/types";
import serviceConfig from "../serviceConfig";

export function shouldSendReminderEmail(
  nowTimestampMillis: number,
  sessionNotificationState: SessionNotificationState,
) {
  const daysSinceLastNotification = Math.round(
    dateFns.differenceInHours(
      nowTimestampMillis,
      sessionNotificationState.lastNotificationTimestampMillis,
    ) / 24,
  );
  switch (sessionNotificationState.sentNotificationCount) {
    case 1:
      return daysSinceLastNotification >= 2;
    case 2:
      return daysSinceLastNotification >= 2;
    case 3:
      return daysSinceLastNotification >= 5;
    case 4:
      return daysSinceLastNotification >= 10;
    case 5:
      return daysSinceLastNotification >= 20;
    case 6:
      return daysSinceLastNotification >= 30;
  }
  return false;
}

function getReviewURL(accessCode: string): string {
  return `${serviceConfig.webBaseURL}/review?accessCode=${encodeURIComponent(
    accessCode,
  )}`;
}

export function getReviewSessionEmailSpec(
  nowTimestampMillis: number,
  userID: string,
  sessionNotificationState: SessionNotificationState | null,
  accessCode: string,
): EmailSpec {
  const reviewURL = getReviewURL(accessCode);
  return {
    subject: "Your next Orbit review session is ready",
    text: `Take a few minutes to review the ideas you've been bringing into your orbit. Click here to begin: ${reviewURL}`,
  };
}
