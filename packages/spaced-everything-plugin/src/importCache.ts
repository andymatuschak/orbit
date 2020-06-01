import * as IT from "incremental-thinking";
import { LevelUp } from "levelup";
import {
  ActionLogID,
  getPromptTaskForID,
  PromptID,
  PromptProvenanceType,
} from "metabook-core";
import {
  maxServerTimestamp,
  PromptStateCache,
  ServerTimestamp,
} from "metabook-firebase-support";
import { notePrompts } from "spaced-everything";
import subleveldown from "subleveldown";
import drainIterator from "./util/drainIterator";

export async function saveJSONRecord(
  db: LevelUp,
  key: string,
  value: unknown,
): Promise<void> {
  await db.put(key, JSON.stringify(value));
}

export async function getJSONRecord<T>(
  db: LevelUp,
  key: string,
): Promise<{ record: T } | null> {
  const recordString = await db
    .get(key)
    .catch((error) => (error.notFound ? null : Promise.reject(error)));
  if (recordString) {
    return { record: JSON.parse(recordString) };
  } else {
    return null;
  }
}

export interface CachedNoteMetadata {
  title: string;
  modificationTimestamp: number;
  URL: string | null;
  headActionLogIDs: ActionLogID[];
}

function getPromptKey(noteID: string, CSTPromptID: string) {
  return `${noteID}!${CSTPromptID}`;
}

const latestServerTimestampKey = "latestServerTimestamp";

export default class SpacedEverythingImportCache {
  private db: LevelUp;
  private promptsByOrbitID: LevelUp; // store of actual prompt contents (formatted as incremental-thinking Prompts), indexed by Orbit prompt IDs
  private orbitIDsByCSTID: LevelUp; // mapping of CST IDs to Orbit prompt IDs
  private notesByID: LevelUp; // store of per-note metadata, indexed by external note ID
  private ITPromptByNoteID: LevelUp; // store of actual prompt contents (formatted as incremental-thinking Prompts), indexed by CST IDs

  constructor(db: LevelUp) {
    this.db = db;
    this.promptsByOrbitID = subleveldown(db, "promptsByOrbitID");
    this.orbitIDsByCSTID = subleveldown(db, "orbitIDsByCSTID");
    this.notesByID = subleveldown(db, "notesByID");
    this.ITPromptByNoteID = subleveldown(db, "ITPromptByNoteID");
  }

  async close() {
    await this.db.close();
  }

  async storePrompts(entries: { promptID: PromptID; ITPrompt: IT.Prompt }[]) {
    await this.promptsByOrbitID.batch(
      entries.map(({ promptID, ITPrompt }) => ({
        type: "put",
        key: promptID,
        value: JSON.stringify(ITPrompt),
      })),
    );
  }

  async getPromptByID(promptID: PromptID): Promise<IT.Prompt | null> {
    const result = await getJSONRecord<IT.Prompt>(
      this.promptsByOrbitID,
      promptID,
    );
    return result?.record ?? null;
  }

  async getLatestServerTimestamp(): Promise<ServerTimestamp | null> {
    const result = await getJSONRecord<ServerTimestamp>(
      this.db,
      latestServerTimestampKey,
    );
    return result?.record ?? null;
  }

  private async getNoteMetadataByID(
    noteID: string,
  ): Promise<CachedNoteMetadata | null> {
    const result = await getJSONRecord<CachedNoteMetadata>(
      this.notesByID,
      noteID,
    );
    return result?.record ?? null;
  }

  async storePromptStateCaches(
    entries: { promptStateCache: PromptStateCache; ITPrompt: IT.Prompt }[],
  ): Promise<void> {
    const ITPromptByNoteIDBatch = this.ITPromptByNoteID.batch();
    const orbitPromptIDsByCSTIDBatch = this.orbitIDsByCSTID.batch();
    const notesByIDBatch = this.notesByID.batch();
    const noteMap = new Map<string, CachedNoteMetadata>();

    let latestServerTimestamp = (await this.getLatestServerTimestamp()) ?? {
      seconds: 0,
      nanoseconds: 0,
    };

    for (const { promptStateCache, ITPrompt } of entries) {
      const { provenance } = promptStateCache.taskMetadata;
      if (provenance?.provenanceType !== PromptProvenanceType.Note) {
        throw new Error(
          `Unexpected prompt provenance type: ${
            provenance?.provenanceType
          } in ${JSON.stringify(promptStateCache)}, null, "\t")}`,
        );
      }

      const promptTask = getPromptTaskForID(promptStateCache.taskID);
      if (promptTask instanceof Error) {
        console.error(
          `Skipping prompt state with invalid prompt task ID ${promptStateCache.taskID}`,
        );
      } else {
        latestServerTimestamp = maxServerTimestamp(
          latestServerTimestamp,
          promptStateCache.latestLogServerTimestamp,
        );

        const existingNoteMetadata = noteMap.get(provenance.externalID);
        const CSTID = notePrompts.getIDForPrompt(ITPrompt);
        const promptsByNoteIDKey = getPromptKey(provenance.externalID, CSTID);
        if (promptStateCache.taskMetadata.isDeleted) {
          ITPromptByNoteIDBatch.del(promptsByNoteIDKey);
          orbitPromptIDsByCSTIDBatch.del(CSTID);
          notesByIDBatch.del(provenance.externalID);
        } else {
          ITPromptByNoteIDBatch.put(
            promptsByNoteIDKey,
            JSON.stringify(ITPrompt),
          );
          orbitPromptIDsByCSTIDBatch.put(CSTID, promptTask.promptID);
          if (
            !existingNoteMetadata ||
            existingNoteMetadata.modificationTimestamp <
              provenance.modificationTimestampMillis
          ) {
            noteMap.set(provenance.externalID, {
              title: provenance.title,
              modificationTimestamp: provenance.modificationTimestampMillis,
              URL: provenance.url,
              headActionLogIDs: promptStateCache.headActionLogIDs,
            });
          }
        }
      }
    }

    const writePromises: Promise<unknown>[] = [];
    writePromises.push(ITPromptByNoteIDBatch.write());
    writePromises.push(orbitPromptIDsByCSTIDBatch.write());

    if (latestServerTimestamp.seconds !== 0) {
      writePromises.push(
        saveJSONRecord(
          this.db,
          latestServerTimestampKey,
          latestServerTimestamp,
        ),
      );
    }

    const existingNoteMetadataByID = await Promise.all(
      [...noteMap.keys()].map(
        async (noteID): Promise<[string, CachedNoteMetadata | null]> => [
          noteID,
          await this.getNoteMetadataByID(noteID),
        ],
      ),
    );
    for (const [noteID, existingCachedMetadata] of existingNoteMetadataByID) {
      const newNoteMetadata = noteMap.get(noteID)!;
      if (
        !existingCachedMetadata ||
        existingCachedMetadata.modificationTimestamp <
          newNoteMetadata.modificationTimestamp
      ) {
        notesByIDBatch.put(noteID, JSON.stringify(newNoteMetadata));
      }
    }
    writePromises.push(notesByIDBatch.write());
  }

  async getNoteIDs(): Promise<string[]> {
    const entries = await drainIterator<string, undefined>(
      this.notesByID.iterator({ keys: true }),
    );
    return entries.map((e) => e[0]);
  }

  async getNoteMetadata(
    noteID: string,
  ): Promise<{
    metadata: CachedNoteMetadata;
    childIDs: string[];
  } | null> {
    const metadata = await this.getNoteMetadataByID(noteID);
    if (metadata) {
      const entries = await drainIterator<string, undefined>(
        this.ITPromptByNoteID.iterator({
          keys: true,
          gte: noteID,
          lt: `${noteID}~`,
        }),
      );
      const childIDs = entries.map(([key]) => key.split("!")[1]);
      return { metadata, childIDs };
    } else {
      return null;
    }
  }

  async getPromptByCSTPromptID(CSTPromptID: string): Promise<IT.Prompt | null> {
    const orbitPromptID: PromptID | null = await this.orbitIDsByCSTID
      .get(CSTPromptID)
      .catch((error) => (error.notFound ? null : Promise.reject(error)));
    if (orbitPromptID) {
      const ITPrompt = await this.getPromptByID(orbitPromptID);
      return ITPrompt;
    } else {
      return null;
    }
  }
}
