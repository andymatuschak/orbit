import { OrbitAPI } from "@withorbit/api";
import { PromptState, PromptTaskID } from "metabook-core";
import * as backend from "../backend";
import { authenticateTypedRequest } from "../util/authenticateRequest";
import { TypedRouteHandler } from "./util/typedRouter";

export const getTaskStates: TypedRouteHandler<
  OrbitAPI.Spec,
  "/taskStates",
  "GET"
> = (request) => {
  return authenticateTypedRequest<OrbitAPI.Spec, "/taskStates", "GET">(
    request,
    async (userID) => {
      let promptStates: Map<PromptTaskID, PromptState>;
      if ("ids" in request.query) {
        promptStates = await backend.promptStates.getPromptStates(
          userID,
          request.query.ids as PromptTaskID[],
        );
      } else {
        promptStates = await backend.promptStates.listPromptStates(
          userID,
          request.query,
        );
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
      };
    },
  );
};
