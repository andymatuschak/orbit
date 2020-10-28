import * as firebase from "firebase-admin";
import { getIDForPrompt, Prompt, PromptID } from "metabook-core";
import { getDataRecordReference } from "metabook-firebase-support";
import { getDatabase } from "./firebase";

export function recordPrompts(prompts: Prompt[]): Promise<PromptID[]> {
  // TODO probably add something about provenance https://github.com/andymatuschak/metabook/issues/59
  // TODO something about user quotas, billing
  return Promise.all(
    prompts.map(async (promptData) => {
      const promptID = await getIDForPrompt(promptData);
      const dataRef = getDataRecordReference(getDatabase(), promptID);
      await dataRef
        .create(promptData)
        .then(() => {
          console.log("Recorded prompt spec", promptID, promptData);
        })
        .catch(() => {
          return;
        });
      return promptID as PromptID;
    }),
  );
}

export async function getPrompts(
  promptIDs: PromptID[],
): Promise<(Prompt | null)[]> {
  const db = getDatabase();
  const snapshots = (await getDatabase().getAll(
    ...promptIDs.map((promptID) => getDataRecordReference(db, promptID)),
  )) as firebase.firestore.DocumentSnapshot<Prompt>[];
  return snapshots.map((snapshot) => snapshot.data() ?? null);
}

export async function storePromptsIfNecessary(
  promptsByID: {
    [key: string]: Prompt;
  },
  getStoredPrompts: (
    promptIDs: PromptID[],
  ) => Promise<(Prompt | null)[]> = getPrompts,
  storePrompts: (prompts: Prompt[]) => Promise<PromptID[]> = recordPrompts,
) {
  const entries = Object.entries(promptsByID) as [PromptID, Prompt][];
  const existingPromptRecords = await getStoredPrompts(
    entries.map(([promptID]) => promptID),
  );
  const missingEntries = entries
    .map((entry, index) => (existingPromptRecords[index] ? null : entry))
    .filter((entry): entry is [PromptID, Prompt] => !!entry);

  if (missingEntries.length > 0) {
    console.log(
      "Storing missing prompts with IDs",
      missingEntries.map(([id]) => id),
    );
    const storedPromptIDs = await storePrompts(
      missingEntries.map(([, prompt]) => prompt),
    );
    const mismatchedPromptIDs = storedPromptIDs.filter(
      (promptID, index) => promptID !== missingEntries[index][0],
    );
    if (mismatchedPromptIDs.length > 0) {
      throw new Error(
        `Prompts don't match their IDs (server/client version mismatch?): ${mismatchedPromptIDs.join(
          ", ",
        )}`,
      );
    }
  }
}
