import events from "events";
import os from "os";
import path from "path";
import fs from "fs";
import unzip from "unzip";
import sqlite from "sqlite";

async function readCollection(ankiCollectionWritePath: string) {
  const database = await sqlite.open(ankiCollectionWritePath, { mode: 1 });
  console.log(await database.all("SELECT * FROM revlog LIMIT 100"));
}

export async function readAnkiCollection(collectionPath: string) {
  const workingDir = path.resolve(os.tmpdir(), `metabook-anki-${Date.now()}`);
  await fs.promises.mkdir(workingDir, { recursive: true });

  const promises: Promise<unknown>[] = [];

  const collectionReadStream = fs
    .createReadStream(collectionPath)
    .pipe(unzip.Parse())
    .on("entry", async (entry) => {
      if (entry.path === "collection.anki2") {
        const ankiCollectionWritePath = path.resolve(workingDir, entry.path);
        const writeStream = fs.createWriteStream(ankiCollectionWritePath);
        entry.pipe(writeStream);
        await events.once(writeStream, "close");
        await readCollection(ankiCollectionWritePath);
      } else {
        entry.autodrain();
      }
    });
  promises.push(events.once(collectionReadStream, "close"));
  await Promise.all(promises);
}
