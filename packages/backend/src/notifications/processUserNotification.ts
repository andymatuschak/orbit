import dateFns from "date-fns";
import { PromptState, PromptTaskID } from "@withorbit/core";
import type {
  SessionNotificationState,
  UserMetadata,
} from "../backend/firebaseSupport";
import * as backend from "../backend";
import getDefaultEmailService from "../email";
import { EmailSpec } from "../email/types";
import { sharedLoggingService } from "../logging";
import {
  getReviewSessionEmailSpec,
  shouldSendReminderEmail,
} from "./reviewSessionEmails";
import {
  evaluateReviewSessionSchedule,
  reviewSessionBatchingLookaheadDays,
} from "./reviewSessionScheduling";

async function _fetchUpcomingPromptStates(
  nowTimestampMillis: number,
  userID: string,
) {
  return await backend.promptStates.listPromptStates(userID, {
    dueBeforeTimestampMillis: dateFns
      .addDays(nowTimestampMillis, reviewSessionBatchingLookaheadDays)
      .valueOf(),
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
  fetchUpcomingPromptStates = () =>
    _fetchUpcomingPromptStates(nowTimestampMillis, userID),
  createEmailAccessCode = () => backend.auth.createOneTimeAccessCode(userID),
): Promise<UserNotificationAction | null> {
  const { sessionNotificationState = null } = userMetadata;

  let promptStates: Map<PromptTaskID, PromptState> | null = null;
  let shouldSendNotification: boolean;
  if (sessionNotificationState) {
    // They already have a session pending. Is today a good day for a reminder?
    shouldSendNotification = shouldSendReminderEmail(
      nowTimestampMillis,
      sessionNotificationState,
    );
  } else {
    promptStates = await fetchUpcomingPromptStates();
    const { shouldScheduleSession, reason } = evaluateReviewSessionSchedule(
      nowTimestampMillis,
      promptStates,
      userMetadata.activeTaskCount ?? null,
    );
    console.log(
      `New review session scheduled: ${shouldScheduleSession} (${reason})`,
    );
    shouldSendNotification = shouldScheduleSession;
  }

  if (shouldSendNotification) {
    promptStates ||= await fetchUpcomingPromptStates();
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
      await backend.users.updateUserMetadata(userID, {
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
