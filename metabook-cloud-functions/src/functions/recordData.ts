import * as functions from "firebase-functions";
import { PromptSpec } from "metabook-core";
import { recordData } from "../firebase";

interface RecordDataArguments {
  prompts: PromptSpec[];
}

interface RecordDataResult {
  promptIDs: string[];
}

export default functions.https.onCall(
  async (data: RecordDataArguments, context): Promise<RecordDataResult> => {
    // TODO require auth
    const promptIDs = await recordData(data.prompts);
    return { promptIDs };
  },
);
