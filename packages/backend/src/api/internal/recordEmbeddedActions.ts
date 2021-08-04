import express from "express";
import { authenticateRequest } from "../util/authenticateRequest";
import { recordEmbeddedActions as recordEmbeddedActionsImpl } from "../util/recordEmbeddedActionsImpl";

// Just used for testing.
export async function recordEmbeddedActions(
  request: express.Request,
  response: express.Response,
) {
  await authenticateRequest(request, response, async (userID) => {
    await recordEmbeddedActionsImpl(request.body, userID);
    response.sendStatus(204);
  });
}
