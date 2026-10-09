import events from "events";
import fs from "fs";
import os from "os";
import path from "path";
import Database from "@farjs/better-sqlite3-wrapper";
import unzip, { Entry } from "unzipper";
import { Card, Collection, Log, Note } from "./ankiDBTypes.js";

async function readRows<R>(
  handle: AnkiCollectionDBHandle,
  tableName: string,
  processRow: (row: R) => Promise<void>,
): Promise<unknown> {
  const rows = handle.prepare(`SELECT * FROM ${tableName}`).all() as R[];
  const promises = rows.map((row: R) => processRow(row));
  return Promise.all(promises);
}

export function readNotes(
  handle: AnkiCollectionDBHandle,
  visitor: (row: Note) => Promise<void>,
): Promise<unknown> {
  return readRows(handle, "notes", visitor);
}

export function readCards(
  handle: AnkiCollectionDBHandle,
  visitor: (row: Card) => Promise<void>,
): Promise<unknown> {
  return readRows(handle, "cards", visitor);
}

export function readLogs(
  handle: AnkiCollectionDBHandle,
  visitor: (row: Log) => Promise<void>,
): Promise<unknown> {
  return readRows(handle, "revlog", visitor);
}

export type AnkiCollectionDBHandle = Database.Database;
export async function readCollection(
  handle: AnkiCollectionDBHandle,
): Promise<Collection> {
  const rawCollection = handle.prepare("SELECT * FROM col").get() as any;
  for (const key of ["conf", "models", "decks", "dconf"]) {
    try {
      rawCollection[key] = JSON.parse(rawCollection[key]);
    } catch (error) {
      throw new Error(`Error parsing ${key}: ${error}`);
    }
  }
  return rawCollection;
}

async function withCollectionDatabase<R = undefined>(
  ankiCollectionPath: string,
  continuation: (handle: AnkiCollectionDBHandle) => Promise<R>,
): Promise<R> {
  const database = new Database(ankiCollectionPath, { readonly: true });
  try {
    return await continuation(database);
  } finally {
    database.close();
  }
}

export interface MediaManifest {
  [key: string]: string; // maps filenames inside the collection package to filenames as referenced within notes
}

export async function readAnkiCollectionPackage<R>(
  collectionPath: string,
  continuation: (
    handle: AnkiCollectionDBHandle,
    mediaManifest: MediaManifest | null,
    attachmentIDsToExtractedPaths: { [key: string]: string },
  ) => Promise<R>,
): Promise<R> {
  const workingDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "anki-import-"),
  );

  try {
    let ankiCollectionWritePath: string | null = null;
    let mediaManifest: MediaManifest | null = null;
    const attachmentIDsToExtractedPaths: { [key: string]: string } = {};
    const promises: Promise<unknown>[] = [];

    function queueExtractEntry(entry: Entry): string {
      const targetPath = path.resolve(workingDir, entry.path);
      const writeStream = fs.createWriteStream(targetPath);
      entry.pipe(writeStream);
      promises.push(events.once(writeStream, "close"));
      return targetPath;
    }

    const collectionReadStream = fs
      .createReadStream(collectionPath)
      .pipe(unzip.Parse())
      .on("entry", (entry: unzip.Entry) => {
        if (entry.path === "collection.anki2") {
          ankiCollectionWritePath = queueExtractEntry(entry);
        } else if (entry.path === "media") {
          entry.setEncoding("utf-8");
          let mediaManifestContents = "";
          entry.on("data", (chunk: string) => {
            mediaManifestContents += chunk;
          });
          promises.push(
            events.once(entry, "end").then(() => {
              mediaManifest = JSON.parse(mediaManifestContents);
            }),
          );
        } else {
          if (isNaN(Number.parseInt(entry.path))) {
            entry.autodrain();
          } else {
            attachmentIDsToExtractedPaths[entry.path] = queueExtractEntry(entry);
          }
        }
      });
    await events.once(collectionReadStream, "close");
    await Promise.all(promises);

    if (ankiCollectionWritePath) {
      return await withCollectionDatabase(ankiCollectionWritePath, (handle) =>
        continuation(handle, mediaManifest, attachmentIDsToExtractedPaths),
      );
    } else {
      throw new Error(
        `${collectionPath} did not contain a collection database (probable version mismatch)`,
      );
    }
  } finally {
    await fs.promises.rm(workingDir, { recursive: true, force: true });
  }
}
