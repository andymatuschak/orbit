import express from "express";
import * as backend from "../../../backend";

export async function consumeAccessCode(
  request: express.Request,
  response: express.Response,
) {
  const accessCode = request.query["accessCode"];
  if (accessCode && typeof accessCode === "string") {
    try {
      const loginToken = await backend.auth.exchangeAccessCodeForCustomLoginToken(
        accessCode,
        Date.now(),
      );
      response.send(loginToken);
    } catch (error) {
      console.error(`Couldn't consume access code ${accessCode}: ${error}`);
      response.status(403).send();
    }
  } else {
    response.status(400).send("Missing access code");
  }
}
