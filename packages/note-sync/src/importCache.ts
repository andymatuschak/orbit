import * as IT from "incremental-thinking";
import { LevelUp } from "levelup";
import {
  ActionLogID,
  getPromptTaskForID,
  PromptID,
  PromptProvenanceType,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import * as spacedEverything from "spaced-everything";
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

const lastStoredTaskID = "lastStoredTaskID";

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

  async getLastStoredTaskID(): Promise<string | null> {
    const result = await getJSONRecord<string>(this.db, lastStoredTaskID);
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

  async storePromptStates(
    entries: {
      promptState: PromptState;
      ITPrompt: IT.Prompt;
      taskID: PromptTaskID;
    }[],
  ): Promise<void> {
    const promptRecordsByCSTIDBatch = this.promptRecordsByCSTID.batch();
    const CSTIDsByNoteIDBatch = this.CSTIDsByNoteID.batch();
    const CSTIDsByOrbitIDBatch = this.CSTIDsByOrbitID.batch();
    const noteMetadataByNoteIDBatch = this.noteMetadataByNoteID.batch();
    const noteMap = new Map<string, CachedNoteMetadata>();

    for (const { promptState, ITPrompt, taskID } of entries) {
      const { provenance } = promptState.taskMetadata;
      if (provenance?.provenanceType !== PromptProvenanceType.Note) {
        throw new Error(
          `Unexpected prompt provenance type: ${
            provenance?.provenanceType
          } in ${JSON.stringify(promptState)}, null, "\t")}`,
        );
      }

      const promptTask = getPromptTaskForID(taskID);
      if (promptTask instanceof Error) {
        console.error(
          `Skipping prompt state with invalid prompt task ID ${taskID}`,
        );
      } else {
        const existingNoteMetadata = noteMap.get(provenance.externalID);
        const CSTID = spacedEverything.notePrompts.getIDForPrompt(ITPrompt);
        const promptsByNoteIDKey = `${provenance.externalID}!${CSTID}`;
        if (promptState.taskMetadata.isDeleted) {
          promptRecordsByCSTIDBatch.del(CSTID);
          CSTIDsByNoteIDBatch.del(promptsByNoteIDKey);
          CSTIDsByOrbitIDBatch.del(promptTask.promptID);
          noteMetadataByNoteIDBatch.del(promptsByNoteIDKey);
        } else {
          const promptRecord: CachedPromptRecord = {
            headActionLogIDs: promptState.headActionLogIDs,
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

    if (entries.length > 0) {
      writePromises.push(
        saveJSONRecord(
          this.db,
          lastStoredTaskID,
          entries[entries.length - 1].taskID,
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
