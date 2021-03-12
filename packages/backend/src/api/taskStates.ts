import { OrbitAPI } from "@withorbit/api";
import { PromptState, PromptTaskID } from "@withorbit/core";
import * as backend from "../backend";
import { authenticateTypedRequest } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter";

export const listTaskStates: TypedRouteHandler<
  OrbitAPI.Spec,
  "/taskStates",
  "GET"
> = (request) => {
  return authenticateTypedRequest<OrbitAPI.Spec, "/taskStates", "GET">(
    request,
    async (userID) => {
      const { query } = request;
      let promptStates: Map<PromptTaskID, PromptState>;
      if ("ids" in query) {
        promptStates = await backend.promptStates.getPromptStates(
          userID,
          query.ids as PromptTaskID[],
        );
      } else {
        // TODO HACK: need real type-safe parsing...
        if (typeof query.limit === "string") {
          query.limit = Number.parseInt(query.limit);
        }
        if (typeof query.dueBeforeTimestampMillis === "string") {
          query.dueBeforeTimestampMillis = Number.parseInt(
            query.dueBeforeTimestampMillis,
          );
        }
        promptStates = await backend.promptStates.listPromptStates(userID, {
          limit: 100,
          ...query,
        });
      }

      return {
        json: {
          objectType: "list",
          hasMore: false,
          data: [...promptStates.entries()].map(([id, data]) => ({
            objectType: "taskState",
            id,
            data,
          })),
        },
        status: 200,
        cachePolicy: CachePolicy.NoStore,
      };
    },
  );
};
