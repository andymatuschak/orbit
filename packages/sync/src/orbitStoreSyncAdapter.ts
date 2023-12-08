import { OrbitStore } from "@withorbit/store-shared";
import {
  AttachmentID,
  AttachmentMIMEType,
  Event,
  EventID,
} from "@withorbit/core";
import { SyncAdapter } from "./syncAdapter.js";

export class OrbitStoreSyncAdapter implements SyncAdapter {
  id: string;
  private readonly _orbitStore: OrbitStore;

  constructor(orbitStore: OrbitStore, syncID: string) {
    this.id = syncID;
    this._orbitStore = orbitStore;
  }

  async putEvents(events: Event[]): Promise<void> {
    await this._orbitStore.database.putEvents(events);
  }

  async listEvents(
    afterEventID: EventID | null,
    limit: number,
  ): Promise<Event[]> {
    return await this._orbitStore.database.listEvents({
      afterID: afterEventID ?? undefined,
      limit,
    });
  }

  async putAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    await this._orbitStore.attachmentStore.storeAttachment(contents, id, type);
  }

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    return (await this._orbitStore.attachmentStore.getAttachment(id)).contents;
  }
}
