import { sharedServerDatabase } from "../../../db/index.js";
import { InternalAPISpec } from "../../internalSpec.js";
import { authenticatedRequestHandler } from "../../util/authenticateRequest.js";
import { CachePolicy, TypedRouteHandler } from "../../util/typedRouter.js";

export const consumeAccessCode: TypedRouteHandler<
  InternalAPISpec,
  "/internal/auth/consumeAccessCode",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  const loginToken =
    await sharedServerDatabase().auth.createCustomLoginToken(userID);

  return {
    status: 200,
    text: loginToken,
    cachePolicy: CachePolicy.NoStore,
  };
});
