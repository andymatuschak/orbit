import express from "express";
import * as backend from "../../../backend";
import { authenticateRequest } from "../../../util/authenticateRequest";

interface CreatePersonalAccessTokenResponse {
  token: string;
}

export async function personalAccessTokens(
  request: express.Request,
  response: express.Response,
) {
  authenticateRequest(request, response, async (userID) => {
    const token = await backend.auth.createPersonalAccessToken(userID);

    const responseJSON: CreatePersonalAccessTokenResponse = {
      token,
    };
    response.header("Cache-Control", "no-store");
    response.json(responseJSON);
  });
}
