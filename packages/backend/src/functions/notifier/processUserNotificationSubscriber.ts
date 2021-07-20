import functions from "firebase-functions";
import { UserMetadata } from "../../backend/firebaseSupport";
import * as backend from "../../backend";
import * as notifications from "../../notifications";

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
  const fetchedUserMetadata = await backend.users.getUserMetadata(userID);
  if (!fetchedUserMetadata) {
    throw new Error(`Unknown user ID ${userID}`);
  }

  const fetchedEmail = await backend.users.getUserEmail(userID);
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
