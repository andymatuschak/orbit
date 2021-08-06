import { OrbitAPI } from "@withorbit/api";
import * as backend from "../../backend";
import { authenticatedRequestHandler } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "../util/typedRouter";

export const getAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/attachments/:id",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  // When running against Google Cloud Storage, we'll redirect to their URLs; when running against the emulator, we'll just vend the data directly.
  const result = await backend.attachments.resolveAttachment(
    request.params.id,
    userID,
    "core2",
  );

  if (result) {
    if ("url" in result) {
      return {
        status: 302,
        redirectURL: result.url,
        cachePolicy: CachePolicy.Immutable,
      };
    } else {
      return {
        status: 200,
        data: result.data,
        mimeType: result.mimeType,
        cachePolicy: CachePolicy.Immutable,
      };
    }
  } else {
    return {
      status: 404,
    };
  }
});
