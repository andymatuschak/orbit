import express from "express";
import { PromptState, PromptTaskID } from "metabook-core";
import { getPromptStateFromPromptStateCache } from "metabook-firebase-support";
import * as backend from "../backend";
import { authenticateRequest } from "../util/authenticateRequest";
import { extractArrayQueryParameter } from "./util/extractArrayQueryParameter";

export async function getTaskStates(
  request: express.Request,
  response: express.Response,
) {
  authenticateRequest(request, response, async (userID) => {
    const taskIDs = extractArrayQueryParameter(request, "taskID") as
      | PromptTaskID[]
      | null;
    if (taskIDs === null) {
      response.status(400).send("Missing taskID query parameter");
      return;
    }

    const taskStateMap = await backend.promptStates.getPromptStates(
      userID,
      taskIDs,
    );

    const output: { [key: string]: PromptState | null } = {};
    for (const taskID of taskIDs) {
      const promptStateCache = taskStateMap.get(taskID);
      if (promptStateCache) {
        output[taskID] = getPromptStateFromPromptStateCache(promptStateCache);
      } else {
        output[taskID] = null;
      }
    }
    response.json(output);
  });
}
