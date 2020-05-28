import * as IT from "incremental-thinking";
import { LevelUp } from "levelup";
import {
  ActionLogID,
  getPromptTaskForID,
  PromptID,
  PromptProvenanceType,
} from "metabook-core";
import { PromptStateCache } from "metabook-firebase-support";
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

export default class SpacedEverythingImportCache {
  private db: LevelUp;
  private promptsByID: LevelUp;
  private notesByID: LevelUp;
  private ITPromptByNoteID: LevelUp;

  constructor(db: LevelUp) {
    this.db = db;
    this.promptsByID = subleveldown(db, "promptMapping");
    this.notesByID = subleveldown(db, "notesByID");
    this.ITPromptByNoteID = subleveldown(db, "ITPromptByNoteID");
  }

  async close() {
    await this.db.close();
  }

  async storePrompts(entries: { promptID: PromptID; ITPrompt: IT.Prompt }[]) {
    await this.promptsByID.batch(
      entries.map(({ promptID, ITPrompt }) => ({
        type: "put",
        key: promptID,
        value: JSON.stringify(ITPrompt),
      })),
    );
  }

  async getPromptByID(promptID: PromptID): Promise<IT.Prompt | null> {
    const result = await getJSONRecord<IT.Prompt>(this.promptsByID, promptID);
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
    const promptBatch = this.ITPromptByNoteID.batch();
    const noteBatch = this.notesByID.batch();
    const noteMap = new Map<string, CachedNoteMetadata>();

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
        const existingNoteMetadata = noteMap.get(provenance.externalID);
        const CSTID = notePrompts.getIDForPrompt(ITPrompt);
        const promptsByNoteIDKey = getPromptKey(provenance.externalID, CSTID);
        if (!promptStateCache.taskMetadata.isDeleted || !existingNoteMetadata) {
          promptBatch.put(promptsByNoteIDKey, JSON.stringify(ITPrompt));
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
        } else {
          promptBatch.del(promptsByNoteIDKey);
          noteBatch.del(provenance.externalID);
        }
      }
    }

    await promptBatch.write();

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
        noteBatch.put(noteID, JSON.stringify(newNoteMetadata));
      }
    }
    await noteBatch.write();
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

  async getPromptByCSTPromptID(
    noteID: string,
    CSTPromptID: string,
  ): Promise<IT.Prompt | null> {
    const key = getPromptKey(noteID, CSTPromptID);
    const result = await getJSONRecord<IT.Prompt>(this.ITPromptByNoteID, key);
    return result?.record ?? null;
  }
}
