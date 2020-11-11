import pubsub from "@google-cloud/pubsub";
import { getAdminApp } from "./adminApp";

const pubsubInstance = new pubsub.PubSub({
  apiEndpoint: "http://localhost:8085",
});

const isDryRun = false;

(async () => {
  await pubsubInstance.topic("processUserNotification").publishJSON({
    userID: "pTDQGh8dnYp3pLXIzyp8pyWDI5qq",
    isDryRun,
  });
})().then(() => {
  console.log("Done.");
  process.exit();
});
