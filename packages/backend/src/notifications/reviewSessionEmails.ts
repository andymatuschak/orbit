import * as dateFns from "date-fns";
import { reviewReminderEmail } from "@withorbit/api";
import { SessionNotificationState } from "../db/userMetadata.js";
import { EmailSpec } from "../email/types.js";
import serviceConfig from "../serviceConfig.js";

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

export async function getReviewSessionEmailSpec(
  nowTimestampMillis: number,
  userID: string,
  sessionNotificationState: SessionNotificationState | null,
  createEmailAccessCode: () => Promise<string>,
): Promise<EmailSpec> {
  const reviewURL = getReviewURL(await createEmailAccessCode());
  const accessCode = await createEmailAccessCode();
  const baseURL = `${serviceConfig.webBaseURL}/updateNotificationSettings?accessCode=${encodeURIComponent(accessCode)}`;
  return reviewReminderEmail({
    reviewURL,
    snoozeURL: baseURL + "&action=snooze1Week",
    unsubscribeURL: baseURL + "&action=unsubscribe",
  });
}
