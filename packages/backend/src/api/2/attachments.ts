import { OrbitAPI } from "@withorbit/api";
import * as backend from "../../backend";
import { authenticatedRequestHandler } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "../util/typedRouter";

export const getAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/attachments/:id",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  return {
    status: 302,
    redirectURL: backend.attachments.getAttachmentURL(
      request.params.id,
      userID,
      "core2",
    ),
    cachePolicy: CachePolicy.Immutable,
  };
});
