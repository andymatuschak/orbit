import { API, OrbitAPI, OrbitAPIValidator } from "@withorbit/api";
import { AttachmentID, AttachmentMIMEType, TaskID } from "@withorbit/core";
import { APIConfig, defaultAPIConfig } from "./apiConfig.js";
import { AuthenticationConfig, RequestManager } from "./requestManager.js";
import { createBlobFromBuffer, getBytesFromBlobLike } from "./util/fetch.js";

const ajvValidator = new OrbitAPIValidator({
  allowUnsupportedRoute: true,
  mutateWithDefaultValues: false,
});

export class OrbitAPIClient {
  private requestManager: RequestManager<OrbitAPI.Spec>;

  // TODO: eventually, I'll want to invert control here and bring auth logic into this client.
  constructor(
    authenticateRequest: () => Promise<AuthenticationConfig>,
    config: APIConfig = defaultAPIConfig,
  ) {
    this.requestManager = new RequestManager<OrbitAPI.Spec>(
      config,
      ajvValidator,
      authenticateRequest,
    );
  }

  listEvents2(
    query: OrbitAPI.Spec["/events"]["GET"]["query"] = {},
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/events"]["GET"]>> {
    return this.requestManager.request("/events", "GET", {
      query,
    });
  }

  putEvents2(
    events: OrbitAPI.Spec["/events"]["PATCH"]["body"],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/events"]["PATCH"]>> {
    return this.requestManager.request("/events", "PATCH", {
      contentType: "application/json",
      body: events,
    });
  }

  async getAttachment2(
    id: AttachmentID,
  ): Promise<{ contents: Uint8Array; mimeType: AttachmentMIMEType }> {
    const blobLike = await this.requestManager.request(
      "/attachments/:id",
      "GET",
      {
        query: {},
        params: { id },
      },
    );
    const contents = await getBytesFromBlobLike(blobLike);
    return { contents, mimeType: blobLike.type };
  }

  async putAttachment2(
    id: AttachmentID,
    mimeType: AttachmentMIMEType,
    contents: Uint8Array,
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/attachments/:id"]["POST"]>> {
    const blob = await createBlobFromBuffer(contents, mimeType);
    return this.requestManager.request("/attachments/:id", "POST", {
      params: { id },
      contentType: "multipart/form-data",
      body: { file: blob as API.BlobLike<AttachmentMIMEType> },
    });
  }

  ingestAttachmentsFromURLs2(
    entries: OrbitAPI.Spec["/attachments/ingestFromURLs"]["POST"]["body"],
  ): Promise<
    API.RouteResponseData<OrbitAPI.Spec["/attachments/ingestFromURLs"]["POST"]>
  > {
    return this.requestManager.request("/attachments/ingestFromURLs", "POST", {
      contentType: "application/json",
      body: entries,
    });
  }

  getTasks2(
    taskIDs: TaskID[],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/tasks/bulkGet"]["POST"]>> {
    return this.requestManager.request("/tasks/bulkGet", "POST", {
      contentType: "application/json",
      body: taskIDs,
    });
  }
}
