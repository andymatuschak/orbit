import * as functions from "firebase-functions";
import { Prompt } from "metabook-core";
import { recordPrompts } from "../firebase";

interface RecordPromptsArguments {
  prompts: Prompt[];
}

interface RecordPromptsResult {
  promptTaskIDs: string[];
}

export default functions.https.onCall(
  async (data: RecordPromptsArguments): Promise<RecordPromptsResult> => {
    // TODO require auth
    const promptTaskIDs = await recordPrompts(data.prompts);
    return { promptTaskIDs };
  },
);
