import express from "express";
import * as backend from "../../../backend";
import { authorizeRequest } from "../../../util/authorizeRequest";

export async function consumeAccessCode(
  request: express.Request,
  response: express.Response,
) {
  authorizeRequest(request, response, async (userID) => {
    const loginToken = await backend.auth.createCustomLoginToken(userID);
    response.send(loginToken);
  });
}
