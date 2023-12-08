import OrbitAPIClient from "@withorbit/api-client";
import {
  AttachmentID,
  AttachmentMIMEType,
  Event,
  EventID,
} from "@withorbit/core";
import { SyncAdapter } from "./syncAdapter.js";

export class APISyncAdapter implements SyncAdapter {
  id: string;
  private readonly _apiClient: OrbitAPIClient;

  constructor(apiClient: OrbitAPIClient, syncID: string) {
    this.id = syncID;
    this._apiClient = apiClient;
  }

  async listEvents(
    afterEventID: EventID | null,
    limit: number,
  ): Promise<Event[]> {
    const response = await this._apiClient.listEvents2({
      afterID: afterEventID ?? undefined,
      limit: limit,
    });
    return response.items;
  }

  async putEvents(events: Event[]): Promise<void> {
    await this._apiClient.putEvents2(events);
  }

  async putAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    await this._apiClient.putAttachment2(id, type, contents);
  }

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    const { contents } = await this._apiClient.getAttachment2(id);
    return contents;
  }
}
