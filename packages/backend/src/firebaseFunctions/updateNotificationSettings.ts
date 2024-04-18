import * as dateFns from "date-fns";
import express from "express";
import functions from "firebase-functions";
import { authenticateTypedRequest } from "../api/util/authenticateRequest.js";
import {
  CachePolicy,
  sendStructuredResponse,
} from "../api/util/typedRouter.js";
import { sharedServerDatabase } from "../db/index.js";
import { UserMetadata } from "../db/userMetadata.js";
import serviceConfig from "../serviceConfig.js";

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

// TODO: rewrite this as an internal API endpoint which the page calls onload
const app = express();
app.use(async (request, response) => {
  try {
    const result = await authenticateTypedRequest(request, async (userID) => {
      const action = getAction(request);
      if (action) {
        const metadataUpdate = actionTable[action](Date.now());
        await sharedServerDatabase().accounts.updateUserMetadata(
          userID,
          metadataUpdate,
        );
      } else {
        console.log("Missing or unknown action", action);
        return {
          status: 400,
        };
      }
      return {
        status: 302,
        redirectURL: getRedirectURL(action),
        cachePolicy: CachePolicy.NoStore,
      };
    });
    sendStructuredResponse(response, result);
  } catch (e) {
    console.error("Unhandled error while updating notification settings", e);
    response.status(500).send();
  }
});

export const updateNotificationSettings = functions.https.onRequest(app);
