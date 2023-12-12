import { PubSub } from "@google-cloud/pubsub";
import { Timestamp } from "firebase-admin/firestore";
import functions from "firebase-functions";
import { sharedServerDatabase } from "../../db/index.js";
import { UserEnumerationRecord } from "../../db/firebaseAccountData.js";
import { shouldEvaluateUserForNotification } from "../../notifications/shouldEvaluateUserForNotification.js";
import {
  ProcessUserNotificationData,
  processUserNotificationTopic,
} from "./processUserNotificationSubscriber.js";

// How notifications work:
// The cloud function defines here runs periodically. It queries all users, doing a cheap filter to find those who may have notifications pending. It pushes an event for each eligible user into a pubsub queue, which is then drained by processUserNotification.

const pubsub = new PubSub();
const notificationTopic = pubsub.topic(processUserNotificationTopic);

// firebase-admin's implementation of Timestamp doesn't implement toJSON, so we need to transform them to JSON-encode them appropriately.
function jsonEncodeServerTimestamps(_key: string, value: unknown): unknown {
  if (value instanceof Timestamp) {
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

    return notificationTopic.publish(Buffer.from(notificationJSONString));
  }
}

export const notificationScheduler = functions.pubsub
  .schedule("every day 08:00")
  .timeZone("America/Los_Angeles")
  .onRun(async () => {
    const evaluationTimestampMillis = Date.now();
    const promises: Promise<unknown>[] = [];
    await sharedServerDatabase().accounts.enumerateUsers(async (record) =>
      promises.push(
        scheduleUserNotificationIfNeeded(record, evaluationTimestampMillis),
      ),
    );

    console.log("Waiting for pubsub broadcasts to finish...");
    await Promise.all(promises);
    console.log("Done");
  });
