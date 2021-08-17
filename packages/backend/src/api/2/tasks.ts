import { OrbitAPI } from "@withorbit/api";
import { Task, TaskID } from "@withorbit/core2";
import { getDatabase } from "../../db";
import { authenticateTypedRequest } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "../util/typedRouter";

export const bulkGetTasks: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/tasks/bulkGet",
  "POST"
> = (request) => {
  return authenticateTypedRequest<OrbitAPI.Spec, "/2/tasks/bulkGet", "POST">(
    request,
    async (userID) => {
      const { body } = request;
      const db = getDatabase(userID);
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
