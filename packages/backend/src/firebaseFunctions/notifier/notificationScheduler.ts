import { PubSub } from "@google-cloud/pubsub";
import admin from "firebase-admin";
import functions from "firebase-functions";
import { sharedServerDatabase } from "../../db";
import { UserEnumerationRecord } from "../../db/firebaseAccountData";
import { shouldEvaluateUserForNotification } from "../../notifications/shouldEvaluateUserForNotification";
import {
  ProcessUserNotificationData,
  processUserNotificationTopic,
} from "./processUserNotificationSubscriber";

// How notifications work:
// The cloud function defines here runs periodically. It queries all users, doing a cheap filter to find those who may have notifications pending. It pushes an event for each eligible user into a pubsub queue, which is then drained by processUserNotification.

const pubsub = new PubSub();
const notificationTopic = pubsub.topic(processUserNotificationTopic);

// firebase-admin's implementation of Timestamp doesn't implement toJSON, so we need to transform them to JSON-encode them appropriately.
function jsonEncodeServerTimestamps(key: string, value: unknown): unknown {
  if (value instanceof admin.firestore.Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  } else {
    return value;
  }
}

async function scheduleUserNotificationIfNeeded(
  record: UserEnumerationRecord,
  evaluationTimestampMillis: number,
) {
  console.log(`Evaluating ${record.userID}`);
  if (
    shouldEvaluateUserForNotification(
      record.userMetadata,
      evaluationTimestampMillis,
    )
  ) {
    const notificationRecord: ProcessUserNotificationData = record;
    const notificationJSONString = JSON.stringify(
      notificationRecord,
      jsonEncodeServerTimestamps,
    );

    await notificationTopic.publish(Buffer.from(notificationJSONString));
  }
}

export const notificationScheduler = functions.pubsub
  .schedule("every day 08:00")
  .timeZone("America/Los_Angeles")
  .onRun(async () => {
    const evaluationTimestampMillis = Date.now();
    await sharedServerDatabase().accounts.enumerateUsers((record) =>
      scheduleUserNotificationIfNeeded(record, evaluationTimestampMillis),
    );
  });
