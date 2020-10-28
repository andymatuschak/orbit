import * as functions from "firebase-functions";
import { Prompt } from "metabook-core";
import * as backend from "../backend";

interface RecordPromptsArguments {
  prompts: Prompt[];
}

interface RecordPromptsResult {
  promptTaskIDs: string[];
}

export default functions.https.onCall(
  async (data: RecordPromptsArguments): Promise<RecordPromptsResult> => {
    // TODO require auth
    const promptIDs = await backend.prompts.recordPrompts(data.prompts);
    console.log("Recorded prompt IDs", promptIDs);
    return { promptTaskIDs: promptIDs };
  },
);
