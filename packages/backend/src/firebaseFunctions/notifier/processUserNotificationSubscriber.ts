import functions from "firebase-functions";
import { sharedServerDatabase } from "../../db/index.js";
import { UserMetadata } from "../../db/userMetadata.js";
import * as notifications from "../../notifications/index.js";

export const processUserNotificationTopic = "processUserNotification";

export type ProcessUserNotificationData =
  | {
      userID: string;
      email: string;
      userMetadata: UserMetadata;
    }
  // Alternative form for debug purposes; the subscriber will fetch the relevant metadata.
  | {
      userID: string;
      isDryRun: boolean;
    };

async function fetchUserData(
  userID: string,
): Promise<{ userMetadata: UserMetadata; email: string }> {
  const db = sharedServerDatabase();
  const fetchedUserMetadata = await db.accounts.getUserMetadata(userID);
  if (!fetchedUserMetadata) {
    throw new Error(`Unknown user ID ${userID}`);
  }

  const fetchedEmail = await db.accounts.getUserEmail(userID);
  if (!fetchedEmail) {
    throw new Error(`No email for user ID ${userID}`);
  }

  return { userMetadata: fetchedUserMetadata, email: fetchedEmail };
}

export const processUserNotificationSubscriber = functions.pubsub
  .topic(processUserNotificationTopic)
  .onPublish(async (message) => {
    const notificationData: ProcessUserNotificationData = message.json;
    const { userID } = notificationData;
    let email: string, userMetadata: UserMetadata, isDryRun: boolean;

    if ("isDryRun" in notificationData) {
      ({ isDryRun } = notificationData);
      ({ email, userMetadata } = await fetchUserData(userID));
    } else {
      ({ email, userMetadata } = notificationData);
      isDryRun = false;
    }

    await notifications.processUserNotification(
      Date.now(),
      userID,
      email,
      userMetadata,
      isDryRun,
    );
  });
