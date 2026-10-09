import * as dateFns from "date-fns";
import express from "express";
import functions from "firebase-functions";
import { authenticateTypedRequest } from "../api/util/authenticateRequest.js";
import {
  CachePolicy,
  sendStructuredResponse,
} from "../api/util/typedRouter.js";
import { sharedServerDatabase } from "../db/index.js";
import { getHostedVaultAccount } from "../db/hostedVaultAccounts.js";
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

function renderConfirmationPage(action: UpdateNotificationSettingsAction) {
  const copy =
    action === "unsubscribe"
      ? {
          title: "Unsubscribe from review notifications?",
          button: "Unsubscribe",
        }
      : {
          title: "Snooze review notifications for a week?",
          button: "Snooze for a week",
        };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <title>${copy.title}</title>
    <style>
      body { background: #f5f7e8; color: #25271f; font: 20px/1.5 system-ui, sans-serif; margin: 0; }
      main { margin: 12vh auto; max-width: 32rem; padding: 2rem; }
      h1 { font-size: 2rem; line-height: 1.2; }
      button { background: #25271f; border: 0; border-radius: 0.25rem; color: white; cursor: pointer; font: inherit; padding: 0.7rem 1rem; }
      a { color: inherit; margin-left: 1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${copy.title}</h1>
      <form method="post">
        <button type="submit">${copy.button}</button>
        <a href="${serviceConfig.webBaseURL}">Cancel</a>
      </form>
    </main>
  </body>
</html>`;
}

const app = express();
app.use(async (request, response) => {
  const action = getAction(request);
  const accessCode = request.query["accessCode"];

  if (!action) {
    response.status(400).send();
    return;
  }

  if (request.method === "GET") {
    if (!accessCode || typeof accessCode !== "string") {
      response.status(401).send();
      return;
    }

    response
      .status(200)
      .set({
        "Cache-Control": CachePolicy.NoStore,
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      })
      .type("html")
      .send(renderConfirmationPage(action));
    return;
  }

  if (request.method !== "POST") {
    response.status(405).set("Allow", "GET, POST").send();
    return;
  }

  try {
    const result = await authenticateTypedRequest(request, async (userID) => {
      const nowTimestampMillis = Date.now();
      const account = await getHostedVaultAccount(userID);
      if (account?.notificationMode === "server") {
        // Older emails retain their confirmation page and identity boundary,
        // but the setting now belongs to the vault, not legacy user metadata.
        const code = await sharedServerDatabase().auth.createOneTimeAccessCode(
          userID,
          nowTimestampMillis,
        );
        return {
          status: 302,
          redirectURL: `${serviceConfig.webBaseURL}/settings?notificationAction=${action}&accessCode=${encodeURIComponent(code)}`,
          cachePolicy: CachePolicy.NoStore,
        };
      }
      await sharedServerDatabase().accounts.updateUserMetadata(
        userID,
        actionTable[action](nowTimestampMillis),
      );
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
