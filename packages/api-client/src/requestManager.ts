import { API, APIValidator } from "@withorbit/api";
import { APIConfig } from "./apiConfig";
import * as Network from "./util/fetch";

export class RequestManager<API extends API.Spec> {
  private readonly config: APIConfig;
  private readonly authorizeRequest?: () => Promise<AuthenticationConfig>;
  private readonly validator: APIValidator;

  constructor(
    config: APIConfig,
    validator: APIValidator,
    authorizeRequest?: () => Promise<AuthenticationConfig>,
  ) {
    this.config = config;
    this.validator = validator;
    this.authorizeRequest = authorizeRequest;
  }

  getRequestURL<
    Path extends Extract<keyof API, string>,
    Method extends Extract<keyof API[Path], API.HTTPMethod>
  >(
    path: Path,
    method: Method,
    requestData: API.RouteRequestData<API[Path][Method]>,
  ): string {
    const url = new URL(`${this.config.baseURL}${path}`);

    const pathComponents = url.pathname.split("/");
    const consumedParams: Set<string> = new Set();
    for (let i = 0; i < pathComponents.length; i++) {
      if (pathComponents[i].startsWith(":")) {
        const parameterName = pathComponents[i].slice(1);
        const replacement =
          requestData.params && requestData.params[parameterName];
        if (replacement) {
          pathComponents[i] = replacement;
        } else {
          throw new Error(
            `Can't create URL for ${path} without param ${parameterName}`,
          );
        }
        consumedParams.add(parameterName);
      }
    }
    if (requestData.params) {
      for (const parameterName of Object.keys(requestData.params)) {
        if (!consumedParams.has(parameterName)) {
          throw new Error(
            `Provided param for ${parameterName} which was not included in ${path}`,
          );
        }
      }
    }
    url.pathname = pathComponents.join("/");

    if (requestData.query) {
      mergeQueryParameters(requestData.query, url.searchParams);
    }
    return url.href;
  }

  async request<
    Path extends Extract<keyof API, string>,
    Method extends Extract<keyof API[Path], API.HTTPMethod>
  >(
    path: Path,
    method: Method,
    requestData: API.RouteRequestData<API[Path][Method]>,
  ): Promise<API.RouteResponseData<API[Path][Method]>> {
    const url = this.getRequestURL(path, method, requestData);
    const authorizationConfig = await this.authorizeRequest?.();
    const wireBody = getWireBody(requestData);

    const response = await (this.config.fetch ?? Network.fetch)(url, {
      method,
      headers: {
        ...defaultHTTPHeaders,
        ...(authorizationConfig && {
          Authorization: getHeaderForAuthenticationConfig(authorizationConfig),
        }),
        ...(wireBody?.contentType &&
          // When using multipart/form-data, we allow fetch() to set the content type header for us, since it includes the multipart boundary ID.
          wireBody.contentType !== "multipart/form-data" && {
            "Content-Type": wireBody.contentType,
          }),
      },
      body: wireBody?.body as any,
    });
    if (response.ok) {
      if (response.status === 204) {
        // TODO validate that the response should be void
        return (undefined as unknown) as API.RouteResponseData<
          API[Path][Method]
        >;
      } else {
        const json = await response.json();

        const validationResult = this.validator.validateResponse(
          { path, method, ...requestData },
          json,
        );
        if (validationResult !== true) {
          console.warn(
            `Validation Error: (${method}) ${path} did not match the expected value for this route`,
          );
          console.warn(validationResult);
        }

        return json as API.RouteResponseData<API[Path][Method]>;
      }
    } else {
      // TODO probably also include body information about the error
      throw new Error(
        `Request failed (${response.status} ${response.statusText}): ${method} ${url}`,
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

function getWireBody<
  API extends API.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], API.HTTPMethod>
>(
  requestData: API.RouteRequestData<API[Path][Method]>,
): { body: Network.FormData | string; contentType: string } | null {
  if (requestData.body) {
    switch (requestData.contentType) {
      case "multipart/form-data":
        const formData = new Network.FormData();
        for (const name of Object.keys(requestData.body)) {
          formData.set(name, requestData.body[name]);
        }
        return { body: formData, contentType: requestData.contentType };
      case "application/json":
      case undefined:
        return {
          body: JSON.stringify(requestData.body),
          contentType: "application/json",
        };
    }
  } else {
    return null;
  }
}

function getHeaderForAuthenticationConfig(
  config: AuthenticationConfig,
): string {
  if ("idToken" in config) {
    return `ID ${config.idToken}`;
  } else if ("personalAccessToken" in config) {
    return `Token ${config.personalAccessToken}`;
  } else {
    throw new Error(`Unknown authentication config`);
  }
}

export type AuthenticationConfig =
  | { idToken: string }
  | { personalAccessToken: string };

const defaultHTTPHeaders = {
  Accept: "application/json",
};
