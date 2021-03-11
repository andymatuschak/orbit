import * as functions from "firebase-functions";
import { Prompt, PromptID } from "@withorbit/core";
import { DataRecord, DataRecordID } from "metabook-firebase-support";
import * as backend from "../backend";

interface GetDataRecordsArguments<R extends DataRecord> {
  recordIDs: DataRecordID<R>[];
}

interface GetDataRecordsResult<R extends DataRecord> {
  records: (R | null)[]; // Entries will be null when records do not exist.
}

export default functions.https.onCall(async function <R extends Prompt>(
  args: GetDataRecordsArguments<Prompt>,
): Promise<GetDataRecordsResult<Prompt>> {
  // TODO: implement length limit
  const recordMap = await backend.prompts.getPrompts(
    args.recordIDs as PromptID[],
  );
  return { records: args.recordIDs.map((id) => recordMap.get(id) ?? null) };
});
