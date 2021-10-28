// Implement this type to declare a typesafe API.
export type Spec = {
  [route: string]: {
    [Method in HTTPMethod]?: RouteData;
  };
};

export type RouteData<
  Q extends QueryParameters = any,
  P extends URLPathParameters = any,
  C extends RequestContentType | undefined = RequestContentType,
  B extends C extends "multipart/form-data" ? RequestFormData : any = any,
  R = any,
> = {
  query?: Q;
  params?: P;
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
  [name: string]: number | string | boolean | Uint8Array | BlobLike<any>;
};

export type QueryParameters = {
  [name: string]: string | string[] | number | undefined;
};

export type URLPathParameters = {
  [name: string]: string;
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

/**
 * i.e. a DOM Blob or a fetch-blob Blob
 * @additionalProperties true
 * @TJS-type object
 */
export interface BlobLike<T> {
  type: T;
  /**
   * File must be less than 10mb in size
   * @minimum 0
   * @maximum 10000000
   * @TJS-type integer
   */
  size: number;

  // React Native doesn't support either of these.
  arrayBuffer?(): Promise<ArrayBuffer>;
  stream?(): any;
}
