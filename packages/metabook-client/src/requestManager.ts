import { API } from "@withorbit/api";
import { APIConfig } from "./apiConfig";
import { fetch, Request } from "./util/fetch";

export class RequestManager<API extends API.Spec> {
  private readonly config: APIConfig;
  private readonly prepareRequest?: (request: Request) => Promise<void>;

  constructor(
    config: APIConfig,
    prepareRequest?: (request: Request) => Promise<void>,
  ) {
    this.config = config;
    this.prepareRequest = prepareRequest;
  }

  createRequest<
    Path extends Extract<keyof API, string>,
    Method extends Extract<keyof API[Path], API.HTTPMethod>
  >(
    path: Path,
    method: Method,
    requestData: API.RouteRequestData<API[Path][Method]>,
  ): Request {
    const url = new URL(`${this.config.baseURL}${path}`);

    if (requestData.query) {
      mergeQueryParameters(requestData.query, url.searchParams);
    }

    // TODO: handle body
    // Make sure to set header: "Content-Type": "application/json",

    return new Request(url, { method, headers: defaultHTTPHeaders });
  }

  async request<
    Path extends Extract<keyof API, string>,
    Method extends Extract<keyof API[Path], API.HTTPMethod>
  >(
    path: Path,
    method: Method,
    requestData: API.RouteRequestData<API[Path][Method]>,
  ): Promise<API.RouteResponseData<API[Path][Method]>> {
    const request = this.createRequest(path, method, requestData);
    await this.prepareRequest?.(request);

    const response = await (this.config.fetch ?? fetch)(request);
    if (response.ok) {
      if (response.status === 204) {
        // TODO validate that the response should be void
        return (undefined as unknown) as API.RouteResponseData<
          API[Path][Method]
        >;
      } else {
        const json = await response.json();
        // TODO validate
        return json as API.RouteResponseData<API[Path][Method]>;
      }
    } else {
      // TODO probably also include body information about the error
      throw new Error(
        `Request failed (${response.status} ${response.statusText}): ${request.method} ${request.url}`,
      );
    }
  }
}

function mergeQueryParameters(
  queryParameters: API.QueryParameters,
  searchParameters: URLSearchParams,
) {
  for (const [key, value] of Object.entries(queryParameters)) {
    if (Array.isArray(value)) {
      for (const subvalue of value) {
        searchParameters.append(key, subvalue);
      }
    } else if (typeof value === "number") {
      searchParameters.set(key, value.toString());
    } else if (typeof value === "string") {
      searchParameters.set(key, value);
    }
  }
}

const defaultHTTPHeaders = {
  Accept: "application/json",
};
