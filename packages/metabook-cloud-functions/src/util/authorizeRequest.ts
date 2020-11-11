import express from "express";
import * as backend from "../backend";

export async function authorizeRequest(
  request: express.Request,
  response: express.Response,
  next: (userID: string) => unknown,
) {
  const accessCode = request.query["accessCode"];
  if (accessCode && typeof accessCode === "string") {
    try {
      const userID = await backend.auth.consumeAccessCode(
        accessCode,
        Date.now(),
      );
      next(userID);
    } catch (error) {
      console.error(`Couldn't consume access code ${accessCode}: ${error}`);
      response.status(403).send();
    }
  } else {
    response.status(400).send("Missing access code or other authorization");
  }
}
