import * as dateFns from "date-fns";
import express from "express";
import functions from "firebase-functions";
import { sharedServerDatabase } from "../db";
import serviceConfig from "../serviceConfig";
import { authenticateRequest } from "../api/util/authenticateRequest";
import { UserMetadata } from "../db/userMetadata";

export type UpdateNotificationSettingsAction = "unsubscribe" | "snooze1Week";

const actionTable: Record<
  UpdateNotificationSettingsAction,
  (nowMillis: number) => Partial<UserMetadata>
> = {
  unsubscribe() {
    return {
      isUnsubscribedFromSessionNotifications: true,
    };
  },
  snooze1Week(nowMillis: number) {
    return {
      isUnsubscribedFromSessionNotifications: false,
      snoozeSessionNotificationsUntilTimestampMillis: dateFns
        .addWeeks(nowMillis, 1)
        .getTime(),
    };
  },
};

function getRedirectURL(action: UpdateNotificationSettingsAction | null) {
  let redirectURL = `${serviceConfig.webBaseURL}/settings`;
  if (action) {
    redirectURL += `?completedAction=${action}`;
  }
  return redirectURL;
}

function getAction(
  request: express.Request,
): UpdateNotificationSettingsAction | null {
  const action = request.query["action"] as UpdateNotificationSettingsAction;
  return actionTable[action] ? action : null;
}

const app = express();
app.use(async (request, response) => {
  await authenticateRequest(request, response, async (userID) => {
    const action = getAction(request);
    if (action) {
      const metadataUpdate = actionTable[action](Date.now());
      await sharedServerDatabase().accounts.updateUserMetadata(
        userID,
        metadataUpdate,
      );
    } else {
      console.log("Missing or unknown action", action);
    }

    response.redirect(getRedirectURL(action));
  });
});

export const updateNotificationSettings = functions.https.onRequest(app);
