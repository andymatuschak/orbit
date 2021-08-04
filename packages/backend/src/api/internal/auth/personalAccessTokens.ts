import express from "express";
import * as backend from "../../../backend";
import { authenticateRequest } from "../../util/authenticateRequest";

interface CreatePersonalAccessTokenResponse {
  token: string;
}

export async function personalAccessTokens(
  request: express.Request,
  response: express.Response,
) {
  await authenticateRequest(request, response, async (userID) => {
    const token = await backend.auth.createPersonalAccessToken(userID);

    const responseJSON: CreatePersonalAccessTokenResponse = {
      token,
    };
    response.json(responseJSON);
  });
}
