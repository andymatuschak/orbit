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
import spacedEverything from "spaced-everything";
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
}

export interface CachedPromptRecord {
  headActionLogIDs: ActionLogID[];
  ITPrompt: IT.Prompt;
}

const latestServerTimestampKey = "latestServerTimestamp";

export default class SpacedEverythingImportCache {
  private db: LevelUp;
  private promptRecordsByCSTID: LevelUp; // store of CachedPromptRecords indexed by CST ID
  private CSTIDsByOrbitID: LevelUp; // mapping of Orbit prompt IDs to CST IDs
  private noteMetadataByNoteID: LevelUp; // store of per-note metadata, indexed by external note ID
  private CSTIDsByNoteID: LevelUp; // index of CSTIDs by note ID

  constructor(db: LevelUp) {
    this.db = db;
    this.promptRecordsByCSTID = subleveldown(db, "promptRecordsByCSTID");
    this.CSTIDsByOrbitID = subleveldown(db, "CSTIDsByOrbitID");
    this.noteMetadataByNoteID = subleveldown(db, "noteMetadataByNoteID");
    this.CSTIDsByNoteID = subleveldown(db, "CSTIDsByNoteID");
  }

  async close() {
    await this.db.close();
  }

  async getPromptRecordByCSTID(
    CSTID: string,
  ): Promise<CachedPromptRecord | null> {
    const result = await getJSONRecord<CachedPromptRecord>(
      this.promptRecordsByCSTID,
      CSTID,
    );
    return result?.record ?? null;
  }

  async getPromptByOrbitPromptID(
    promptID: PromptID,
  ): Promise<IT.Prompt | null> {
    const orbitPromptID: PromptID | null = await this.CSTIDsByOrbitID.get(
      promptID,
    ).catch((error) => (error.notFound ? null : Promise.reject(error)));
    if (orbitPromptID) {
      const promptRecord = await this.getPromptRecordByCSTID(orbitPromptID);
      return promptRecord?.ITPrompt ?? null;
    } else {
      return null;
    }
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
      this.noteMetadataByNoteID,
      noteID,
    );
    return result?.record ?? null;
  }

  async storePromptStateCaches(
    entries: {
      promptStateCache: PromptStateCache;
      ITPrompt: IT.Prompt;
      promptID: PromptID;
    }[],
  ): Promise<void> {
    const promptRecordsByCSTIDBatch = this.promptRecordsByCSTID.batch();
    const CSTIDsByNoteIDBatch = this.CSTIDsByNoteID.batch();
    const CSTIDsByOrbitIDBatch = this.CSTIDsByOrbitID.batch();
    const noteMetadataByNoteIDBatch = this.noteMetadataByNoteID.batch();
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
        const CSTID = spacedEverything.notePrompts.getIDForPrompt(ITPrompt);
        const promptsByNoteIDKey = `${provenance.externalID}!${CSTID}`;
        if (promptStateCache.taskMetadata.isDeleted) {
          promptRecordsByCSTIDBatch.del(CSTID);
          CSTIDsByNoteIDBatch.del(promptsByNoteIDKey);
          CSTIDsByOrbitIDBatch.del(promptTask.promptID);
          noteMetadataByNoteIDBatch.del(promptsByNoteIDKey);
        } else {
          const promptRecord: CachedPromptRecord = {
            headActionLogIDs: promptStateCache.headActionLogIDs,
            ITPrompt: ITPrompt,
          };
          promptRecordsByCSTIDBatch.put(CSTID, JSON.stringify(promptRecord));
          CSTIDsByNoteIDBatch.put(promptsByNoteIDKey, CSTID);
          CSTIDsByOrbitIDBatch.put(promptTask.promptID, CSTID);
          if (
            !existingNoteMetadata ||
            existingNoteMetadata.modificationTimestamp <
              provenance.modificationTimestampMillis
          ) {
            noteMap.set(provenance.externalID, {
              title: provenance.title,
              modificationTimestamp: provenance.modificationTimestampMillis,
              URL: provenance.url,
            });
          }
        }
      }
    }

    const writePromises: Promise<unknown>[] = [];
    writePromises.push(promptRecordsByCSTIDBatch.write());
    writePromises.push(CSTIDsByNoteIDBatch.write());
    writePromises.push(CSTIDsByOrbitIDBatch.write());

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
        noteMetadataByNoteIDBatch.put(noteID, JSON.stringify(newNoteMetadata));
      }
    }
    writePromises.push(noteMetadataByNoteIDBatch.write());

    await Promise.all(writePromises);
  }

  async getNoteIDs(): Promise<string[]> {
    const entries = await drainIterator<string, undefined>(
      this.noteMetadataByNoteID.iterator({ keys: true }),
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
      const entries = await drainIterator<undefined, string>(
        this.CSTIDsByNoteID.iterator({
          keys: false,
          values: true,
          gte: noteID,
          lt: `${noteID}~`,
        }),
      );
      const childIDs = entries.map(([, value]) => value);
      return { metadata, childIDs };
    } else {
      return null;
    }
  }
}
