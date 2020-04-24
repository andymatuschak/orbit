import LevelUp, * as levelup from "levelup";
import LevelJS from "level-js";
import {
  AttachmentID,
  AttachmentURLReference,
  Prompt,
  PromptID,
} from "metabook-core";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

export default class DataRecordCache {
  private db: levelup.LevelUp;
  constructor(cacheName = "DataRecordCache") {
    this.db = LevelUp(LevelJS(cacheName));
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

  async clear(): Promise<void> {
    await this.db.clear();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
