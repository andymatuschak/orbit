import { OrbitAPI } from "@withorbit/api";
import { getIDForPrompt, Prompt, PromptID } from "@withorbit/core";
import * as backend from "../backend";
import { authenticatedRequestHandler } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter";

export const listTaskData: TypedRouteHandler<
  OrbitAPI.Spec,
  "/taskData",
  "GET"
> = async (request) => {
  // TODO HACK: Replace this with real query deserialization.
  const ids = Array.isArray(request.query.ids)
    ? request.query.ids
    : [request.query.ids];

  const taskData = await backend.prompts.getPrompts(ids);

  return {
    json: {
      objectType: "list",
      hasMore: false,
      data: [...taskData.entries()].map(([id, data]) => ({
        objectType: "taskData",
        id,
        data,
      })),
    },
    status: 200,
    cachePolicy: CachePolicy.Immutable,
  };
};

function validatePrompts(
  prompts: { id: PromptID; data: Prompt }[],
): Promise<unknown> {
  return Promise.all(
    prompts.map(async ({ id, data }) => {
      const computedID = await getIDForPrompt(data);
      if (id !== computedID) {
        throw new Error(
          `Computed ID for prompt (${computedID}) does not match provided ID (${id}). ${JSON.stringify(
            data,
            null,
            "\t",
          )}`,
        );
      }
    }),
  );
}

export const storeTaskData: TypedRouteHandler<
  OrbitAPI.Spec,
  "/taskData",
  "PATCH"
> = authenticatedRequestHandler(async (request) => {
  const prompts = request.body;
  await validatePrompts(prompts);

  await backend.prompts.storePrompts(prompts.map(({ data }) => data));
  // TODO: move logging responsibility from onDataRecordCreate

  return { status: 204 };
});
