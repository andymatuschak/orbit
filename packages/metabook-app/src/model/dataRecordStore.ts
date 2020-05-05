import LevelUp, * as levelup from "levelup";
import RNLeveldown from "react-native-leveldown";
import {
  AttachmentID,
  AttachmentURLReference,
  Prompt,
  PromptID,
} from "metabook-core";
import { getJSONRecord, saveJSONRecord } from "./levelDBUtil";

export default class DataRecordStore {
  private db: levelup.LevelUp;
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

  async clear(): Promise<void> {
    await this.db.clear();
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}
