import { OrbitAPI, API, OrbitAPIValidator } from "@withorbit/api";
import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  AttachmentMimeType,
  PromptID,
  PromptTaskID,
} from "@withorbit/core";
import { AttachmentMIMEType, TaskID } from "@withorbit/core2";
import * as core2 from "@withorbit/core2";
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

  listTaskStates(
    query: {
      limit?: number;
      createdAfterID?: PromptTaskID;
      dueBeforeTimestampMillis?: number;
    } = {},
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/taskStates"]["GET"]>> {
    return this.requestManager.request("/taskStates", "GET", {
      query,
    });
  }

  getTaskStates(
    ids: PromptTaskID[],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/taskStates"]["GET"]>> {
    return this.requestManager.request("/taskStates", "GET", {
      query: { ids },
    });
  }

  listActionLogs(
    query: OrbitAPI.Spec["/actionLogs"]["GET"]["query"] = {},
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/actionLogs"]["GET"]>> {
    return this.requestManager.request("/actionLogs", "GET", {
      query,
    });
  }

  storeActionLogs(
    logs: OrbitAPI.Spec["/actionLogs"]["PATCH"]["body"],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/actionLogs"]["PATCH"]>> {
    return this.requestManager.request("/actionLogs", "PATCH", {
      contentType: "application/json",
      body: logs,
    });
  }

  getTaskData(
    ids: PromptID[],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/taskData"]["GET"]>> {
    return this.requestManager.request("/taskData", "GET", {
      query: { ids },
    });
  }

  storeTaskData(
    data: OrbitAPI.Spec["/taskData"]["PATCH"]["body"],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/taskData"]["PATCH"]>> {
    return this.requestManager.request("/taskData", "PATCH", {
      contentType: "application/json",
      body: data,
    });
  }

  storeAttachment(
    attachment: Attachment,
  ): Promise<
    OrbitAPI.ResponseObject<
      "attachmentIDReference",
      AttachmentID,
      AttachmentIDReference
    >
  > {
    const blob = new Blob([attachment.contents], { type: attachment.mimeType });
    return this.requestManager.request("/attachments", "POST", {
      contentType: "multipart/form-data",
      body: { file: blob as API.BlobLike<AttachmentMimeType> },
    });
  }

  getAttachmentURL(attachmentID: AttachmentID): string {
    return this.requestManager.getRequestURL("/attachments/:id", "GET", {
      query: {},
      params: { id: attachmentID },
    });
  }

  listEvents2(
    query: OrbitAPI.Spec["/2/events"]["GET"]["query"] = {},
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/2/events"]["GET"]>> {
    return this.requestManager.request("/2/events", "GET", {
      query,
    });
  }

  putEvents2(
    events: OrbitAPI.Spec["/2/events"]["PATCH"]["body"],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/2/events"]["PATCH"]>> {
    return this.requestManager.request("/2/events", "PATCH", {
      contentType: "application/json",
      body: events,
    });
  }

  getAttachment2(
    id: core2.AttachmentID,
  ): Promise<API.BlobLike<AttachmentMIMEType>> {
    return this.requestManager.request("/2/attachments/:id", "GET", {
      query: {},
      params: { id },
    });
  }

  putAttachment2(
    id: core2.AttachmentID,
    mimeType: core2.AttachmentMIMEType,
    contents: Uint8Array,
  ): Promise<
    API.RouteResponseData<OrbitAPI.Spec["/2/attachments/:id"]["POST"]>
  > {
    const blob = new Blob([contents], { type: mimeType });
    return this.requestManager.request("/2/attachments/:id", "POST", {
      params: { id },
      contentType: "multipart/form-data",
      body: { file: blob as API.BlobLike<AttachmentMIMEType> },
    });
  }

  ingestAttachmentsFromURLs2(
    entries: OrbitAPI.Spec["/2/attachments/ingestFromURLs"]["POST"]["body"],
  ): Promise<
    API.RouteResponseData<
      OrbitAPI.Spec["/2/attachments/ingestFromURLs"]["POST"]
    >
  > {
    return this.requestManager.request(
      "/2/attachments/ingestFromURLs",
      "POST",
      {
        contentType: "application/json",
        body: entries,
      },
    );
  }

  getTasks2(
    taskIDs: TaskID[],
  ): Promise<API.RouteResponseData<OrbitAPI.Spec["/2/tasks/bulkGet"]["POST"]>> {
    return this.requestManager.request("/2/tasks/bulkGet", "POST", {
      contentType: "application/json",
      body: taskIDs,
    });
  }
}
