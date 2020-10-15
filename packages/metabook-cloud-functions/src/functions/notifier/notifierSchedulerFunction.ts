import functions from "firebase-functions";

const notifierSchedulerFunction = functions.pubsub
  .schedule("every day 08:00")
  .timeZone("America/Los_Angeles")
  .onRun((context) => {
    console.log("Sending scheduled notifications");
    return null;
  });
export default notifierSchedulerFunction;
