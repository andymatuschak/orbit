import LevelUp, * as levelup from "levelup";
import LevelJS from "level-js";
import {
  AttachmentID,
  AttachmentURLReference,
  Prompt,
  PromptID,
} from "metabook-core";

export default class DataRecordCache {
  private db: levelup.LevelUp;
  constructor(cacheName = "DataRecordCache") {
    this.db = LevelUp(LevelJS(cacheName));
  }

  private saveRecord(key: string, value: unknown): Promise<void> {
    return this.db.put(key, JSON.stringify(value));
  }

  private async getRecord<R>(key: string): Promise<R | null> {
    const recordString = await this.db
      .get(key)
      .catch((error) => (error.notFound ? null : Promise.reject(error)));
    if (recordString) {
      return JSON.parse(recordString) as R;
    } else {
      return null;
    }
  }

  async savePrompt(id: PromptID, prompt: Prompt): Promise<void> {
    await this.saveRecord(id, prompt);
  }

  async getPrompt(id: PromptID): Promise<Prompt | null> {
    return this.getRecord(id);
  }

  async saveAttachmentURLReference(
    id: AttachmentID,
    reference: AttachmentURLReference,
  ): Promise<void> {
    await this.saveRecord(id, reference);
  }

  async getAttachmentURLReference(
    id: AttachmentID,
  ): Promise<AttachmentURLReference | null> {
    return this.getRecord(id);
  }

  async clear() {
    return this.db.clear();
  }

  async close() {
    return this.db.close();
  }
}
