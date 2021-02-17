export { MetabookFirebaseUserClient } from "./firebaseClient";
export * from "./userClient";
import { OrbitAPI } from "@withorbit/api";
import { APIConfig, defaultAPIConfig } from "../apiConfig";
import { RequestManager } from "../requestManager";
import { Request } from "../util/fetch";

export class UserClient {
  private requestManager: RequestManager<OrbitAPI.Spec>;

  // authenticateRequest delegates authorization of requests to the client. Clients should add an HTTP Authorization header according to their access method.
  // TODO: invert control, internalize this authorization logic into this library
  constructor(
    authenticateRequest: (request: Request) => Promise<void>,
    config: APIConfig = defaultAPIConfig,
  ) {
    this.requestManager = new RequestManager<OrbitAPI.Spec>(
      config,
      authenticateRequest,
    );
  }

  listTaskStates = (query: OrbitAPI.Spec["/taskStates"]["GET"]["query"] = {}) =>
    this.requestManager.request("/taskStates", "GET", {
      query,
    });

  listActionLogs = (query: OrbitAPI.Spec["/actionLogs"]["GET"]["query"] = {}) =>
    this.requestManager.request("/actionLogs", "GET", {
      query,
    });

  storeActionLogs = (logs: OrbitAPI.Spec["/actionLogs"]["PATCH"]["body"]) =>
    this.requestManager.request("/actionLogs", "PATCH", {
      body: logs,
    });
}
