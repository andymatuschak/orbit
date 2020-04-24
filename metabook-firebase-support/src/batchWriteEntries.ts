import {
  Database,
  DocumentReference,
  ServerTimestamp,
} from "./libraryAbstraction";

const batchSize = 250;

export default async function batchWriteEntries<
  D extends Database,
  T extends ServerTimestamp
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logEntries: [DocumentReference<D>, any][],
  db: D,
  timestampConstructor: (millis: number, nanos: number) => T,
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
      const data = { ...logEntries[index][1] };
      for (const key of Object.keys(data)) {
        if (
          typeof data[key] === "object" &&
          data[key] &&
          "_nanoseconds" in data[key] &&
          "_seconds" in data[key]
        ) {
          data[key] = timestampConstructor(
            data[key]["_seconds"],
            data[key]["_nanoseconds"],
          );
        }
      }
      // There are subtle incompatibilities between the firebase SDKs' batch set functions, but they're not material here.
      (batch as any).set(logEntries[index][0], data);
    }
    await batch.commit();
  }
}
