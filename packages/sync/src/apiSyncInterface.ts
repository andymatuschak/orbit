import OrbitAPIClient from "@withorbit/api-client";
import {
  AttachmentID,
  AttachmentMIMEType,
  Event,
  EventID,
} from "@withorbit/core2";
import { SyncInterface } from "./syncInterface";

export class APISyncInterface implements SyncInterface {
  id: string;
  private readonly _apiClient: OrbitAPIClient;
  private readonly _readLocalAttachmentURL: (
    storedAttachmentURL: string,
  ) => Promise<Uint8Array>;

  constructor(
    apiClient: OrbitAPIClient,
    syncID: string,
    // Our different platforms (web, RN, Node) will need to implement this differently. It's unfortunate that this API approach involves loading the entire attachment into memory--it'd be better to stream--but this is much more straightforward to make work across platforms.
    readLocalAttachmentURL: (
      storedAttachmentURL: string,
    ) => Promise<Uint8Array>,
  ) {
    this.id = syncID;
    this._apiClient = apiClient;
    this._readLocalAttachmentURL = readLocalAttachmentURL;
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
    sourceURL: string,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    // TODO: Implement v2 API for storing an attachment
    const contents = await this._readLocalAttachmentURL(sourceURL);
    await this._apiClient.storeAttachment({
      type: "image", // HACK
      // @ts-ignore TODO HACK: duck-casting core2 to core MIME types
      mimeType: type,
      contents,
    });
  }

  async getURLForAttachment(id: AttachmentID): Promise<string> {
    // TODO: Possibly a different v2 API route?
    return this._apiClient.getAttachmentURL(id);
  }
}
