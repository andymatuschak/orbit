import * as functions from "firebase-functions";
import { PromptID } from "metabook-core";
import { DataRecord, DataRecordID } from "metabook-firebase-support";
import * as backend from "../backend";

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
  const records = await backend.prompts.getPrompts(
    args.recordIDs as PromptID[],
  );
  return { records };
});
