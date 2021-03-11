import * as functions from "firebase-functions";
import { getIDForPrompt, Prompt } from "@withorbit/core";
import { getPromptIDForFirebaseKey } from "metabook-firebase-support";
import { sharedLoggingService } from "../logging";

export const onDataRecordCreate = functions.firestore
  .document("data/{dataID}")
  .onCreate(async (snapshot, context) => {
    const record = snapshot.data() as Prompt;
    const recordID = await getIDForPrompt(record);
    const storedRecordID = getPromptIDForFirebaseKey(context.params["dataID"]);

    if (recordID !== storedRecordID) {
      throw new Error(
        `Mismatch in data record: stored at CID ${storedRecordID} (Firebase ${context.params["dataID"]}) but computed CID is ${recordID}`,
      );
    }

    await sharedLoggingService.logDataRecord({
      timestamp: Date.now(),
      id: recordID,
      record,
    });
  });
