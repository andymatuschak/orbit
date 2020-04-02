import * as functions from "firebase-functions";
import { PromptSpec } from "metabook-core";
import { recordPrompts } from "../firebase";

interface RecordPromptsArguments {
  prompts: PromptSpec[];
}

interface RecordPromptsResult {
  promptIDs: string[];
}

export default functions.https.onCall(
  async (data: RecordPromptsArguments): Promise<RecordPromptsResult> => {
    // TODO require auth
    const promptIDs = await recordPrompts(data.prompts);
    return { promptIDs };
  },
);
