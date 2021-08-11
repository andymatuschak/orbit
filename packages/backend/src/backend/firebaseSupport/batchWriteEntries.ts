import firebase from "firebase-admin";

const batchSize = 250;

export default async function batchWriteEntries<Value>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logEntries: (readonly [firebase.firestore.DocumentReference<Value>, Value])[],
  db: firebase.firestore.Firestore,
) {
  for (
    let batchBaseIndex = 0;
    batchBaseIndex <= logEntries.length;
    batchBaseIndex += batchSize
  ) {
    const batch = db.batch();
    for (
      let index = batchBaseIndex;
      index < batchBaseIndex + batchSize && index < logEntries.length;
      index++
    ) {
      // There are subtle incompatibilities between the firebase SDKs' batch set functions, but they're not material here.
      (batch as any).set(logEntries[index][0], logEntries[index][1]);
    }
    await batch.commit();
  }
}
