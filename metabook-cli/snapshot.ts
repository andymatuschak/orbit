import { Command, flags } from "@oclif/command";
import admin from "firebase-admin";

import fs from "fs";
import { MetabookActionLog } from "metabook-client/dist/types/actionLog";
import { PromptSpec } from "metabook-core";
import * as path from "path";
import serviceAccount from "./adminKey.json";

interface Snapshot {
  data: { [key: string]: PromptSpec };
  logs: { [key: string]: MetabookActionLog };
}

function deleteQueryBatch(
  db: admin.firestore.Firestore,
  query: admin.firestore.Query,
  resolve: (value?: unknown) => void,
  reject: (error: Error) => void,
) {
  query
    .get()
    .then((snapshot) => {
      // When there are no documents left, we are done
      if (snapshot.size === 0) {
        return 0;
      }

      // Delete documents in a batch
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then((numDeleted) => {
      if (numDeleted === 0) {
        resolve();
        return;
      }

      // Recurse on the next process tick, to avoid
      // exploding the stack.
      process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, reject);
      });
    })
    .catch(reject);
}

function deleteCollection(
  db: admin.firestore.Firestore,
  collectionRef: admin.firestore.CollectionReference,
  batchSize: number,
) {
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

async function batchWriteEntries(
  logEntries: [string, any][],
  db: FirebaseFirestore.Firestore,
  logRef: FirebaseFirestore.CollectionReference,
) {
  for (
    let batchBaseIndex = 0;
    batchBaseIndex <= logEntries.length;
    batchBaseIndex += 500
  ) {
    const batch = db.batch();
    for (
      let index = batchBaseIndex;
      index < batchBaseIndex + 500 && index < logEntries.length;
      index++
    ) {
      const data = { ...logEntries[index][1] };
      for (const key of Object.keys(data)) {
        if (
          typeof data[key] === "object" &&
          data[key] &&
          "_nanoseconds" in data[key] &&
          "_seconds" in data[key]
        ) {
          data[key] = new admin.firestore.Timestamp(
            data[key]["_seconds"],
            data[key]["_nanoseconds"],
          );
        }
      }
      batch.set(logRef.doc(logEntries[index][0]), data);
    }
    await batch.commit();
  }
}

class Snapshot extends Command {
  static flags = {
    help: flags.help(),
    save: flags.boolean({
      char: "s",
      exclusive: ["restore"],
    }),
    restore: flags.boolean({
      char: "r",
      exclusive: ["save"],
    }),
    userID: flags.string({
      required: true,
    }),
  };

  static args = [{ name: "snapshotPath", required: true }];

  async run() {
    const { flags, args } = this.parse(Snapshot);

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as any),
      databaseURL: "https://metabook-system.firebaseio.com",
    });

    const db = app.firestore();
    const snapshotPath = path.resolve(process.cwd(), args.snapshotPath);
    const userID = flags.userID;

    const logRef = db
      .collection("users")
      .doc(userID)
      .collection("logs") as admin.firestore.CollectionReference<
      MetabookActionLog
    >;

    const dataRef = db.collection(
      "data",
    ) as admin.firestore.CollectionReference<PromptSpec>;

    if (flags.save) {
      const logSnapshot = await logRef.get();
      if (logSnapshot.empty) {
        throw new Error(`No logs for user ${userID}`);
      }
      console.log(`Read ${logSnapshot.size} logs`);

      const logs: { [key: string]: MetabookActionLog } = {};
      const specIDs = new Set<string>();
      logSnapshot.forEach((docSnapshot) => {
        const log = docSnapshot.data();
        logs[docSnapshot.id] = log;
        specIDs.add(log.promptTaskID.promptSpecID);
      });

      const data: { [key: string]: PromptSpec } = {};
      await Promise.all(
        [...specIDs.values()].map(async (specID) => {
          const specData = await dataRef.doc(specID).get();
          if (!specData.exists) {
            console.error(
              `User has log for spec ID ${specID}, which doesn't exist`,
            );
            return;
          }

          data[specID] = specData.data()!;
        }),
      );
      console.log(`Read ${specIDs.size} specs`);

      fs.promises.writeFile(snapshotPath, JSON.stringify({ data, logs }), {
        encoding: "utf-8",
      });
    } else if (flags.restore) {
      const snapshotJSONString = await fs.promises.readFile(snapshotPath, {
        encoding: "utf-8",
      });
      const snapshot = JSON.parse(snapshotJSONString) as Snapshot;

      await deleteCollection(db, logRef, 500);

      const logEntries = Object.entries(snapshot.logs);
      await batchWriteEntries(logEntries, db, logRef);
      console.log(`Wrote ${logEntries.length} logs`);

      const dataEntries = Object.entries(snapshot.data);
      await batchWriteEntries(dataEntries, db, dataRef);
      console.log(`Wrote ${dataEntries.length} specs`);
    } else {
      throw new Error("Either --save or --restore must be set.");
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
(Snapshot.run() as Promise<unknown>).catch(require("@oclif/errors/handle"));
