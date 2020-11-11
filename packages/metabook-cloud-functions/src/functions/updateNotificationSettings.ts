import * as dateFns from "date-fns";
import express from "express";
import * as functions from "firebase-functions";
import { UserMetadata } from "metabook-firebase-support";
import * as backend from "../backend";
import serviceConfig from "../serviceConfig";
import { authorizeRequest } from "../util/authorizeRequest";

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
app.use((request, response) => {
  authorizeRequest(request, response, async (userID) => {
    const action = getAction(request);
    if (action) {
      const metadataUpdate = actionTable[action](Date.now());
      await backend.users.updateUserMetadata(userID, metadataUpdate);
    } else {
      console.log("Missing or unknown action", action);
    }

    response.redirect(getRedirectURL(action));
  });
});

export const updateNotificationSettings = functions.https.onRequest(app);
