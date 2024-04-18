import { API as ApiType } from "@withorbit/api";
import { sharedServerDatabase } from "../../db/index.js";
import {
  TypedRequest,
  TypedResponse,
  TypedRouteHandler,
} from "./typedRouter.js";

export async function authenticateTypedRequest<
  API extends ApiType.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], ApiType.HTTPMethod>,
>(
  request: TypedRequest<Exclude<API[Path][Method], undefined>>,
  next: (
    userID: string,
  ) => Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>>,
): Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>> {
  const db = sharedServerDatabase();
  const authorizationHeader = request.header("Authorization");
  if (authorizationHeader) {
    const match = authorizationHeader.match(/ID (.+)/);
    if (match) {
      try {
        return next(await db.auth.validateIDToken(match[1]));
      } catch (error) {
        console.error(`Couldn't validate ID token: ${error}`);
        return { status: 401 };
      }
    } else {
      const match = authorizationHeader.match(/Token (.+)/);
      if (match) {
        try {
          return next(await db.auth.consumeAccessCode(match[1]));
        } catch (error) {
          console.error(`Couldn't consume access token: ${error}`);
          return { status: 401 };
        }
      } else {
        console.error(`Unknown authorization scheme`);
        return { status: 401 };
      }
    }
  } else {
    const accessCode = (request.query as any)["accessCode"];
    if (accessCode && typeof accessCode === "string") {
      let userID: string;
      try {
        userID = await db.auth.consumeAccessCode(accessCode, Date.now());
      } catch (error) {
        console.error(`Couldn't consume access code ${accessCode}: ${error}`);
        return { status: 401 };
      }
      return next(userID);
    } else {
      return { status: 401 };
    }
  }
}

export function authenticatedRequestHandler<
  API extends ApiType.Spec,
  Path extends Extract<keyof API, string>,
  Method extends Extract<keyof API[Path], ApiType.HTTPMethod>,
>(
  handler: (
    request: TypedRequest<Exclude<API[Path][Method], undefined>>,
    userID: string,
  ) => Promise<TypedResponse<ApiType.RouteResponseData<API[Path][Method]>>>,
): TypedRouteHandler<API, Path, Method> {
  return (request) =>
    authenticateTypedRequest(request, (userID) => handler(request, userID));
}
