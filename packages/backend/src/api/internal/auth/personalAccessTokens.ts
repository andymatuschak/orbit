import express from "express";
import { sharedServerDatabase } from "../../../db/index.js";
import { authenticateRequest } from "../../util/authenticateRequest.js";

interface CreatePersonalAccessTokenResponse {
  token: string;
}

export async function personalAccessTokens(
  request: express.Request,
  response: express.Response,
) {
  await authenticateRequest(request, response, async (userID) => {
    const token = await sharedServerDatabase().auth.createPersonalAccessToken(
      userID,
    );

    const responseJSON: CreatePersonalAccessTokenResponse = {
      token,
    };
    response.json(responseJSON);
  });
}
