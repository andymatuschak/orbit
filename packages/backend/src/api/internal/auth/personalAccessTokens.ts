import { sharedServerDatabase } from "../../../db/index.js";
import { InternalAPISpec } from "../../internalSpec.js";
import { authenticatedRequestHandler } from "../../util/authenticateRequest.js";
import { CachePolicy, TypedRouteHandler } from "../../util/typedRouter.js";

export const personalAccessTokens: TypedRouteHandler<
  InternalAPISpec,
  "/internal/auth/personalAccessTokens",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  const token =
    await sharedServerDatabase().auth.createPersonalAccessToken(userID);
  return {
    status: 200,
    cachePolicy: CachePolicy.NoStore,
    json: {
      token,
    },
  };
});
