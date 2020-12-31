import express from "express";
import { PromptState, PromptTaskID } from "metabook-core";
import { getPromptStateFromPromptStateCache } from "metabook-firebase-support";
import * as backend from "../backend";
import { authorizeRequest } from "../util/authorizeRequest";

export async function getTaskStates(
  request: express.Request,
  response: express.Response,
) {
  authorizeRequest(request, response, async (userID) => {
    const taskIDQueryParameter = request.query["taskID"];
    let taskIDs: PromptTaskID[];
    if (typeof taskIDQueryParameter === "string") {
      taskIDs = [taskIDQueryParameter] as PromptTaskID[];
    } else if (taskIDQueryParameter && Array.isArray(taskIDQueryParameter)) {
      taskIDs = taskIDQueryParameter as PromptTaskID[];
    } else {
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
