import * as functions from "firebase-functions";
import { Prompt } from "@withorbit/core";
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
    const promptIDs = await backend.prompts.storePrompts(data.prompts);
    console.log("Recorded prompt IDs", promptIDs);
    return { promptTaskIDs: promptIDs };
  },
);
