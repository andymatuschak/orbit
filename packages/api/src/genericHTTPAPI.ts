// Implement this type to declare a typesafe API.
export type Spec = {
  [route: string]: {
    [Method in HTTPMethod]?: RouteData;
  };
};

export type RouteData<
  Q extends QueryParameters = any,
  C extends RequestContentType | undefined = RequestContentType,
  B extends C extends "multipart/form-data" ? RequestFormData : any = any,
  R = any
> = {
  // TODO: URL path params...
  query?: Q;
  response: R;
} & (
  | (C extends "application/json" | undefined
      ? {
          contentType?: "application/json";
          body?: B;
        }
      : never)
  | (C extends "multipart/form-data"
      ? {
          contentType: "multipart/form-data";
          body: B;
        }
      : never)
);

export type RequestContentType = "application/json" | "multipart/form-data";
export type RequestFormData = {
  [name: string]: number | string | boolean | Uint8Array | BlobLike;
};

export type QueryParameters = {
  [name: string]: string | string[] | number | undefined;
};

export type RouteRequestData<D> = D extends RouteData
  ? Omit<D, "response">
  : never;

export type RouteResponseData<D> = D extends RouteData ? D["response"] : never;

export type HTTPMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "HEAD"
  | "DELETE"
  | "OPTIONS";

// i.e. a DOM Blob or a fetch-blob Blob
export interface BlobLike {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
  stream(): any;
}
