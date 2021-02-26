export { MetabookFirebaseUserClient } from "./firebaseClient";
export * from "./userClient";
import { OrbitAPI } from "@withorbit/api";
import {
  Attachment,
  AttachmentID,
  AttachmentIDReference,
  PromptID,
  PromptTaskID,
} from "metabook-core";
import { APIConfig, defaultAPIConfig } from "../apiConfig";
import { AuthenticationConfig, RequestManager } from "../requestManager";
import { Request, Blob } from "../util/fetch";

export class UserClient {
  private requestManager: RequestManager<OrbitAPI.Spec>;

  // authenticateRequest delegates authorization of requests to the client. Clients should add an HTTP Authorization header according to their access method.
  // TODO: invert control, internalize this authorization logic into this library
  constructor(
    authenticateRequest: () => Promise<AuthenticationConfig>,
    config: APIConfig = defaultAPIConfig,
  ) {
    this.requestManager = new RequestManager<OrbitAPI.Spec>(
      config,
      authenticateRequest,
    );
  }

  listTaskStates = (
    query: {
      limit?: number;
      createdAfterID?: PromptTaskID;
      dueBeforeTimestampMillis?: number;
    } = {},
  ) =>
    this.requestManager.request("/taskStates", "GET", {
      query,
    });

  getTaskStates = (ids: PromptTaskID[]) =>
    this.requestManager.request("/taskStates", "GET", {
      query: { ids },
    });

  listActionLogs = (query: OrbitAPI.Spec["/actionLogs"]["GET"]["query"] = {}) =>
    this.requestManager.request("/actionLogs", "GET", {
      query,
    });

  storeActionLogs = (logs: OrbitAPI.Spec["/actionLogs"]["PATCH"]["body"]) =>
    this.requestManager.request("/actionLogs", "PATCH", {
      body: logs,
    });

  getTaskData = (ids: PromptID[]) =>
    this.requestManager.request("/taskData", "GET", {
      query: { ids },
    });

  storeTaskData = (data: OrbitAPI.Spec["/taskData"]["PATCH"]["body"]) =>
    this.requestManager.request("/taskData", "PATCH", {
      body: data,
    });

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
      body: { file: blob },
    });
  }
}
