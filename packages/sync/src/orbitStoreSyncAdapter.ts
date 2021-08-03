import { OrbitStore } from "@withorbit/store-shared";
import {
  AttachmentID,
  AttachmentMIMEType,
  Event,
  EventID,
} from "@withorbit/core2";
import { SyncAdapter } from "./syncAdapter";

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
    sourceURL: string,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    await this._orbitStore.attachmentStore.storeAttachmentFromURL(
      sourceURL,
      id,
      type,
    );
  }

  async getURLForAttachment(id: AttachmentID): Promise<string> {
    const url =
      await this._orbitStore.attachmentStore.getURLForStoredAttachment(id);
    if (!url) {
      throw new Error(`Orbit store has no URL for attachment with ID ${id}`);
    }
    return url;
  }
}
