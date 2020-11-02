import fs from "fs";
import {
  ActionLog,
  ActionLogID,
  AttachmentID,
  getIDForActionLog,
  getIDForPrompt,
  Prompt,
  PromptField,
  PromptID,
} from "metabook-core";
import {
  batchWriteEntries,
  getActionLogIDForFirebaseKey,
  getActionLogIDReference,
  getAttachmentIDForFirebaseKey,
  getDataRecordReference,
  getFirebaseKeyForCIDString,
  getLogCollectionReference,
  getStorageObjectNameForAttachmentID,
  getTaskStateCacheCollectionReference,
  storageBucketName,
} from "metabook-firebase-support";
import CID from "multiformats/cid";
import { base58btc } from "multiformats/bases/base58";
import { getPromptIDForFirebaseKey } from "../../metabook-firebase-support/dist/firebaseKeyEncoding";
import { getAdminApp } from "./adminApp";
import { deleteCollection } from "./deleteCollection";

const userID = "k2SFGEIg70UEltRbHEAed8yERc32";

(async () => {
  // 1. Attachments.
  // Iterate through all existing attachments, moving them to their new paths.
  /*const ref = getAdminApp().storage().bucket(storageBucketName);
  const allFiles = await ref.getFiles();
  const attachmentMapping: { [key: string]: AttachmentID } = {};
  for (const file of allFiles[0].slice(1)) {
    // Get old key (encoded for Firebase).
    const firebaseKey = file.name.split("/")[1];

    const newCIDString = getAttachmentIDForFirebaseKey(firebaseKey);
    const newCID = CID.parse(newCIDString);

    const oldCID = CID.create(1, 0, newCID.multihash);
    const oldCIDString = oldCID.toString(base58btc) as AttachmentID;

    attachmentMapping[oldCIDString] = newCIDString;
  }

  await fs.promises.writeFile(
    "attachmentMapping.json",
    JSON.stringify(attachmentMapping),
    { encoding: "utf8" },
  );*/

  const promptTypeMapping: { [key: string]: string } = {
    basic: "qaPrompt",
    applicationPrompt: "applicationPrompt",
    cloze: "clozePrompt",
  };

  // 2. Prompts.
  const app = getAdminApp();
  const db = app.firestore();
  const promptCollection = db.collection("data");
  const prompts = await promptCollection.get();
  const promptMapping: { [key: string]: PromptID } = {};
  const promptEntries: [unknown, unknown][] = [];
  /*for (const promptDoc of prompts.docs) {
    const mismappedCIDString = getPromptIDForFirebaseKey(promptDoc.id);
    const mismappedCID = CID.parse(mismappedCIDString);

    const oldCID = CID.create(1, 0x70, mismappedCID.multihash);
    const oldCIDString = oldCID.toString(base58btc) as PromptID;

    function adaptField(promptField: PromptField) {
      if (promptField.attachments === undefined) {
        throw new Error(`Missing attachments list for ${promptField}`);
      }
      promptField.attachments = promptField.attachments.map((attachment) => {
        const newAttachmentID = attachmentMapping[attachment.id];
        if (!newAttachmentID) {
          throw new Error(
            `Can't find old attachment with ID ${attachment.id} for prompt ${
              promptField.contents
            }. Should be firebase key: ${getStorageObjectNameForAttachmentID(
              attachment.id,
            )}`,
          );
        }
        return { ...attachment, id: newAttachmentID };
      });
    }

    try {
      const data = promptDoc.data();
      if (!promptTypeMapping[data.promptType]) {
        throw new Error(`Unknown prompt type ${data.promptType}`);
      }
      data.promptType = promptTypeMapping[data.promptType];
      switch (data.promptType) {
        case "basic":
          adaptField(data.question);
          adaptField(data.answer);
          delete data.explanation;
          break;
        case "applicationPrompt":
          for (const variant of data.variants) {
            adaptField(variant.question);
            adaptField(variant.answer);
            delete variant.explanation;
          }
          break;
        case "cloze":
          adaptField(data.body);
      }

      promptMapping[oldCIDString] = await getIDForPrompt(data as Prompt);
      promptEntries.push([
        getDataRecordReference(db, promptMapping[oldCIDString]),
        data,
      ]);
    } catch (error) {
      console.log(`Skipping ${promptDoc.id} - ${promptDoc.data()}: ${error}`);
    }
  }*/

  /*await fs.promises.writeFile(
    "attachmentMapping.json",
    JSON.stringify(attachmentMapping),
    { encoding: "utf8" },
  );*/

  // 3. Logs.
  const logCollection = getLogCollectionReference(db, userID);
  /*const logs = (await logCollection.orderBy("timestampMillis").get()).docs;
  await fs.promises.writeFile(
    "logs.json",
    JSON.stringify(
      logs.map((snapshot) => {
        return { id: snapshot.id, data: snapshot.data() };
      }),
    ),
    {
      encoding: "utf8",
    },
  );*/
  const logs = JSON.parse(
    await fs.promises.readFile("logs.json", { encoding: "utf-8" }),
  );

  console.log(`Fetched ${logs.length} logs.`);
  const logMapping: { [key: string]: ActionLogID } = {};
  const logEntries: [unknown, unknown][] = [];

  function getOldCIDFromFirebaseKey(firebaseKey: string): string {
    const mismappedCIDString = getActionLogIDForFirebaseKey(firebaseKey);
    const mismappedCID = CID.parse(mismappedCIDString);

    const oldCID = CID.create(1, 0x70, mismappedCID.multihash);
    const oldCIDString = oldCID.toString(base58btc) as ActionLogID;
    return oldCIDString;
  }

  type LogList = { id: string; data: ActionLog }[];
  async function processLogs(logs: LogList) {
    const danglingLogs: LogList = [];
    for (const logDoc of logs) {
      const oldCIDString = getOldCIDFromFirebaseKey(logDoc.id);

      function adaptTaskID(taskID: string): string {
        // Old task IDs put the prompt ID first.
        const components = taskID.split("/");
        const oldPromptID = components[0];
        const oldPromptType = components[1];
        if (!promptTypeMapping[oldPromptType]) {
          throw new Error(`Unknown prompt type ${oldPromptType} in ${taskID}`);
        }
        if (!promptMapping[oldPromptID]) {
          throw new Error(
            `Missing prompt reference ${oldPromptID} in ${taskID}`,
          );
        }
        const newTaskID = [
          promptTypeMapping[oldPromptType],
          promptMapping[oldPromptID],
          ...components.slice(2),
        ].join("/");
        // console.log(`${oldCIDString}: ${taskID} => ${newTaskID}`);
        return newTaskID;
      }

      const data = logDoc.data;
      try {
        if ("parentActionLogIDs" in data && data.parentActionLogIDs) {
          data.parentActionLogIDs = data.parentActionLogIDs.map(
            (oldLogID: string) => {
              if (!logMapping[oldLogID]) {
                danglingLogs.push(logDoc);
                throw new Error(`Missing log reference: ${oldLogID}`);
              }
              return logMapping[oldLogID];
            },
          );
        }

        data.taskID = adaptTaskID(data.taskID);
        logMapping[oldCIDString] = await getIDForActionLog(data as ActionLog);
        logEntries.push([
          getActionLogIDReference(db, userID, logMapping[oldCIDString]),
          data,
        ]);
      } catch (error) {
        // console.log(`Skipping ${oldCIDString} - ${data}: ${error}`);
      }
    }

    if (danglingLogs.length !== logs.length) {
      console.log(
        `Processed ${logs.length}; ${danglingLogs.length} remain to resolve`,
      );
      await processLogs(danglingLogs);
    } else {
      console.error(`${danglingLogs.length} logs remain unresolved`);
      const taskIDs: Set<string> = new Set();
      for (const log of danglingLogs) {
        console.log(
          log,
          new Date(log.data.timestampMillis),
          // @ts-ignore
          log.data.parentActionLogIDs.map((id) =>
            getFirebaseKeyForCIDString(id),
          ),
        );
        taskIDs.add(log.data.taskID);
      }
      console.log("Missing task IDs", taskIDs);
    }
  }
  // await processLogs(
  //   logs.map((snapshot) => {
  //     return { id: snapshot.id, data: snapshot.data() as ActionLog };
  //   }),
  // );
  await processLogs(logs);

  // await fs.promises.writeFile(
  //   "promptEntries.json",
  //   JSON.stringify(promptEntries),
  //   { encoding: "utf8" },
  // );
  //
  await fs.promises.writeFile("logEntries.json", JSON.stringify(logEntries), {
    encoding: "utf8",
  });

  /*console.log("Deleting prompt collection");
  await deleteCollection(db, promptCollection);
  console.log("Writing new prompts");
  await batchWriteEntries(
    // @ts-ignore
    promptEntries,
    db,
  );*/
  console.log("Deleting user logs");
  await deleteCollection(db, logCollection);
  console.log("Deleting user states");
  await deleteCollection(db, getTaskStateCacheCollectionReference(db, userID));
  console.log("Writing new logs");
  await batchWriteEntries(
    // @ts-ignore
    logEntries,
    db,
  );
})().then(() => process.exit(0));
