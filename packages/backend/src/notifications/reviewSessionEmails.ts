import * as dateFns from "date-fns";
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

async function appendFooter(
  baseSpec: EmailSpec,
  createEmailAccessCode: () => Promise<string>,
): Promise<EmailSpec> {
  const accessCode = await createEmailAccessCode();
  const baseURL = `${
    serviceConfig.webBaseURL
  }/updateNotificationSettings?accessCode=${encodeURIComponent(accessCode)}`;
  const unsubscribeURL = baseURL + "&action=unsubscribe";
  const snoozeURL = baseURL + "&action=snooze1Week";
  return {
    ...baseSpec,
    text: `${baseSpec.text}
    
---

Questions? Thoughts? Please reply and let me know.

To snooze review notifications for a week, click here: ${snoozeURL}

To unsubscribe from review notifications, click here: ${unsubscribeURL}`,

    html: `${baseSpec.html}
<p style="font-size: 80%; color: #666; margin-top: 3em;">Comments? Thoughts? Please reply and let me know.</p>
<p style="font-size: 80%; color: #666">To snooze review notifications for a week, <a href="${snoozeURL}">click here.</a></p>
<p style="font-size: 80%; color: #666">To unsubscribe from review notifications, <a href="${unsubscribeURL}">click here.</a></p>
`,
  };
}

export async function getReviewSessionEmailSpec(
  nowTimestampMillis: number,
  userID: string,
  sessionNotificationState: SessionNotificationState | null,
  createEmailAccessCode: () => Promise<string>,
): Promise<EmailSpec> {
  const reviewURL = getReviewURL(await createEmailAccessCode());
  const baseSpec = {
    subject: "Your next Orbit review session is ready",
    text: `Take a few minutes to review the ideas you've been bringing into your orbit. Click here to begin: ${reviewURL}`,
    html: `<p>Take a few minutes to review the ideas you've been bringing into your orbit. <a href="${reviewURL}">Click here to begin.</a></p>`,
  };
  return await appendFooter(baseSpec, createEmailAccessCode);
}
