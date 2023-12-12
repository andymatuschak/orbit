import { EntityType, Task } from "@withorbit/core";
import dateFns from "date-fns";
import { sharedServerDatabase } from "../db/index.js";
import { SessionNotificationState, UserMetadata } from "../db/userMetadata.js";
import getDefaultEmailService from "../email/index.js";
import { EmailSpec } from "../email/types.js";
import { sharedLoggingService } from "../logging/index.js";
import {
  getReviewSessionEmailSpec,
  shouldSendReminderEmail,
} from "./reviewSessionEmails.js";
import {
  evaluateReviewSessionSchedule,
  reviewSessionBatchingLookaheadDays,
} from "./reviewSessionScheduling.js";

async function _fetchUpcomingTasks(
  nowTimestampMillis: number,
  userID: string,
): Promise<Task[]> {
  return await sharedServerDatabase()
    .getUserDatabase(userID)
    .listEntities({
      entityType: EntityType.Task,
      predicate: [
        "dueTimestampMillis",
        "<=",
        dateFns
          .addDays(nowTimestampMillis, reviewSessionBatchingLookaheadDays)
          .valueOf(),
      ],
      limit: 100,
    });
}

export function _updateSessionNotificationStateForNewNotification(
  nowTimestampMillis: number,
  oldNotificationState: SessionNotificationState | null,
): SessionNotificationState {
  return {
    firstNotificationTimestampMillis:
      oldNotificationState?.firstNotificationTimestampMillis ??
      nowTimestampMillis,
    lastNotificationTimestampMillis: nowTimestampMillis,
    // This isn't generally a safe way to increment a counter in a distributed database, since there could be races, but in practice, this is only evaluated once a day, so I'm not worried about it.
    sentNotificationCount:
      (oldNotificationState?.sentNotificationCount ?? 0) + 1,
  };
}

interface UserNotificationAction {
  emailSpec: EmailSpec;
  newNotificationState: SessionNotificationState;
}

export async function _getUserNotificationAction(
  nowTimestampMillis: number,
  userID: string,
  userMetadata: UserMetadata,
  fetchUpcomingTasks = () => _fetchUpcomingTasks(nowTimestampMillis, userID),
  createEmailAccessCode = () =>
    sharedServerDatabase().auth.createOneTimeAccessCode(userID),
): Promise<UserNotificationAction | null> {
  const { sessionNotificationState = null } = userMetadata;

  let shouldSendNotification: boolean;
  if (sessionNotificationState) {
    // They already have a session pending. Is today a good day for a reminder?
    shouldSendNotification = shouldSendReminderEmail(
      nowTimestampMillis,
      sessionNotificationState,
    );
  } else {
    const tasks = await fetchUpcomingTasks();
    const { shouldScheduleSession, reason } = evaluateReviewSessionSchedule(
      nowTimestampMillis,
      tasks,
      userMetadata.activeTaskCount ?? null,
    );
    console.log(
      `New review session scheduled: ${shouldScheduleSession} (${reason})`,
    );
    shouldSendNotification = shouldScheduleSession;
  }

  if (shouldSendNotification) {
    return {
      emailSpec: await getReviewSessionEmailSpec(
        nowTimestampMillis,
        userID,
        sessionNotificationState,
        createEmailAccessCode,
      ),
      newNotificationState: _updateSessionNotificationStateForNewNotification(
        nowTimestampMillis,
        sessionNotificationState,
      ),
    };
  } else {
    return null;
  }
}

export async function processUserNotification(
  nowTimestampMillis: number,
  userID: string,
  email: string,
  userMetadata: UserMetadata,
  isDryRun = false,
) {
  console.log(`Processing notifications for ${userID}`);
  const action = await _getUserNotificationAction(
    nowTimestampMillis,
    userID,
    userMetadata,
  );

  if (action) {
    if (!isDryRun) {
      await getDefaultEmailService().sendEmail(email, action.emailSpec);
      await sharedServerDatabase().accounts.updateUserMetadata(userID, {
        sessionNotificationState: action.newNotificationState,
      });
      await sharedLoggingService.logSessionNotification({
        userID,
        timestamp: nowTimestampMillis,
        emailSpec: action.emailSpec,
        sessionNotificationNumber:
          (userMetadata.sessionNotificationState?.sentNotificationCount ?? 0) +
          1,
      });
    } else {
      console.log("Would send notification", action);
    }
  }
}
