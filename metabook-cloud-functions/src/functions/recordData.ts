import * as functions from "firebase-functions";
import { PromptData } from "metabook-core";
import { recordData } from "../firebase";

interface RecordDataArguments {
  prompts: PromptData[];
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
