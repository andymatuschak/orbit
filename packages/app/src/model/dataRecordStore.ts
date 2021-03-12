import LevelUp, * as levelup from "levelup";
import RNLeveldown from "../util/leveldown";
import {
  AttachmentID,
  AttachmentURLReference,
  Prompt,
  PromptID,
} from "@withorbit/core";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

const hasFinishedInitialImportKey = "__hasFinishedInitialImport";

export default class DataRecordStore {
  private db: levelup.LevelUp;
  private cachedHasFinishedInitialImport: boolean | undefined;

  constructor(cacheName = "DataRecordStore") {
    this.db = LevelUp(new RNLeveldown(cacheName));
  }

  async savePrompt(id: PromptID, prompt: Prompt): Promise<void> {
    await saveJSONRecord(this.db, id, prompt);
  }

  async getPrompt(id: PromptID): Promise<Prompt | null> {
    const result = await getJSONRecord(this.db, id);
    return (result?.record as Prompt) ?? null;
  }

  async saveAttachmentURLReference(
    id: AttachmentID,
    reference: AttachmentURLReference,
  ): Promise<void> {
    await saveJSONRecord(this.db, id, reference);
  }

  async getAttachmentURLReference(
    id: AttachmentID,
  ): Promise<AttachmentURLReference | null> {
    const result = await getJSONRecord(this.db, id);
    return (result?.record as AttachmentURLReference) ?? null;
  }

  async getHasFinishedInitialImport(): Promise<boolean> {
    if (this.cachedHasFinishedInitialImport === undefined) {
      const result = await getJSONRecord<boolean>(
        this.db,
        hasFinishedInitialImportKey,
      );
      this.cachedHasFinishedInitialImport = result?.record ?? false;
    }
    return this.cachedHasFinishedInitialImport;
  }

  async setHasFinishedInitialImport(): Promise<void> {
    await saveJSONRecord(this.db, hasFinishedInitialImportKey, true);
    this.cachedHasFinishedInitialImport = true;
  }

  async clear(): Promise<void> {
    this.cachedHasFinishedInitialImport = undefined;
    await this.db.clear();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
