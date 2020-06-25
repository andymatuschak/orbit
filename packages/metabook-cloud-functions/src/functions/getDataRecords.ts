import * as functions from "firebase-functions";
import { DataRecord, DataRecordID } from "metabook-firebase-support";
import { getDataRecords } from "../firebase/firebase";

interface GetDataRecordsArguments<R extends DataRecord> {
  recordIDs: DataRecordID<R>[];
}

interface GetDataRecordsResult<R extends DataRecord> {
  records: (DataRecord | null)[]; // Entries will be null when records do not exist.
}

export default functions.https.onCall(async function <R extends DataRecord>(
  args: GetDataRecordsArguments<R>,
): Promise<GetDataRecordsResult<R>> {
  // TODO: implement length limit
  const records = await getDataRecords(args.recordIDs);
  return { records };
});
