import express from "express";
import * as backend from "../../../backend";
import { authenticateRequest } from "../../util/authenticateRequest";

export async function consumeAccessCode(
  request: express.Request,
  response: express.Response,
) {
  await authenticateRequest(request, response, async (userID) => {
    const loginToken = await backend.auth.createCustomLoginToken(userID);
    response.send(loginToken);
  });
}
