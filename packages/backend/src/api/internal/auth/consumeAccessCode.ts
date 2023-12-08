import express from "express";
import { sharedServerDatabase } from "../../../db";
import { authenticateRequest } from "../../util/authenticateRequest.js";

export async function consumeAccessCode(
  request: express.Request,
  response: express.Response,
) {
  await authenticateRequest(request, response, async (userID) => {
    const loginToken = await sharedServerDatabase().auth.createCustomLoginToken(
      userID,
    );
    response.send(loginToken);
  });
}
