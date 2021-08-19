import { API, OrbitAPI, OrbitAPIValidator } from "@withorbit/api";
import { AttachmentID, AttachmentMIMEType, TaskID } from "@withorbit/core";
import { APIConfig, defaultAPIConfig } from "./apiConfig";
import { AuthenticationConfig, RequestManager } from "./requestManager";
import { Blob } from "./util/fetch";

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

  getAttachment2(id: AttachmentID): Promise<API.BlobLike<AttachmentMIMEType>> {
    return this.requestManager.request("/attachments/:id", "GET", {
      query: {},
      params: { id },
    });
  }

  putAttachment2(
    id: AttachmentID,
    mimeType: AttachmentMIMEType,
    contents: Uint8Array,
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/attachments/:id"]["POST"]>> {
    const blob = new Blob([contents], { type: mimeType });
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
