import { OrbitAPI } from "@withorbit/api";
import { Task, TaskID } from "@withorbit/core";
import { sharedServerDatabase } from "../db/index.js";
import { authenticateTypedRequest } from "./util/authenticateRequest.js";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter.js";

export const bulkGetTasks: TypedRouteHandler<
  OrbitAPI.Spec,
  "/tasks/bulkGet",
  "POST"
> = (request) => {
  return authenticateTypedRequest<OrbitAPI.Spec, "/tasks/bulkGet", "POST">(
    request,
    async (userID) => {
      const { body } = request;
      const db = sharedServerDatabase().getUserDatabase(userID);
      const results = await db.getEntities<Task, TaskID>(body);

      return {
        json: {
          type: "list",
          hasMore: false,
          items: [...results.values()],
        },
        status: 200,
        cachePolicy: CachePolicy.NoStore,
      };
    },
  );
};
