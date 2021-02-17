import { API } from "@withorbit/api";
import express from "express";

// Adapted from https://github.com/rawrmaan/restyped-express-async

export interface TypedRequest<Route extends API.RouteData>
  extends express.Request {
  // TODO: params
  body: Route["body"];
  query: Route["query"];
}

type TypedAPIImplementation<API extends API.Spec> = {
  [Path in Extract<keyof API, string>]: TypedRouteList<API, Path>;
};

type TypedRouteList<
  API extends API.Spec,
  Path extends Extract<keyof API, string>
> = {
  [Method in Extract<keyof API[Path], API.HTTPMethod>]: TypedRouteHandler<
    API,
    Path,
    Method
  >;
};

export type TypedRouteHandler<
  API extends API.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], API.HTTPMethod>
> = (
  request: TypedRequest<API[Path][Method]>,
) => Promise<TypedResponse<API.RouteResponseData<API[Path][Method]>>>;

export type TypedResponse<Data> =
  | { status: 200; json: Data }
  | { status: 204 }
  | { status: 400 | 401 };

export default function createTypedRouter<API extends API.Spec>(
  app: express.Express | express.Router,
  handlers: TypedAPIImplementation<API>,
) {
  type APIPaths = Extract<keyof API, string>;
  type APIRoutes<Path extends APIPaths> = Extract<
    keyof API[Path],
    API.HTTPMethod
  >;

  function createRoute<Path extends APIPaths, Method extends APIRoutes<Path>>(
    path: Path,
    baseRouteMatcher: express.IRouterMatcher<void>,
    handler: TypedRouteHandler<API, Path, Method>,
  ) {
    baseRouteMatcher(path, function (request, response, next) {
      // TODO: validate request data
      return handler(request as TypedRequest<API[Path][Method]>)
        .then((result) => {
          response.status(result.status);
          if (result.status === 200) {
            response.send(result.json);
          }
        })
        .catch((err) => next(err));
    });
  }

  const baseRouteMatchers: {
    [Method in API.HTTPMethod]: express.IRouterMatcher<void>;
  } = {
    GET: app.get.bind(app),
    POST: app.post.bind(app),
    PUT: app.put.bind(app),
    PATCH: app.patch.bind(app),
    HEAD: app.head.bind(app),
    DELETE: app.delete.bind(app),
    OPTIONS: app.options.bind(app),
  };

  for (const path of Object.keys(handlers) as (keyof typeof handlers)[]) {
    const methods = handlers[path] as TypedRouteList<API, typeof path>;
    for (const method of Object.keys(
      handlers[path],
    ) as (keyof typeof methods)[]) {
      createRoute(path, baseRouteMatchers[method], handlers[path][method]);
    }
  }
}
