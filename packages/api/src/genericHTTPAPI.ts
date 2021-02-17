// Implement this type to declare a typesafe API.
export type Spec = {
  [route: string]: {
    [Method in HTTPMethod]?: RouteData;
  };
};

export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "HEAD"
  | "DELETE"
  | "OPTIONS";
export type RouteData<Q extends QueryParameters = any, B = any, R = any> = {
  // TODO: body, URL path params...
  query?: Q;
  body?: B;
  response: R;
};

export type QueryParameters = {
  [name: string]: string | string[] | number | undefined;
};

export type RouteRequestData<D extends RouteData> = {
  query?: D["query"];
  body?: D["body"];
};

export type RouteResponseData<D extends RouteData> = D["response"];
