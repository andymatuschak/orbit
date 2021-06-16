import express from "express";
import * as backend from "../../../backend";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie";

export async function createLoginToken(
  request: express.Request,
  response: express.Response,
) {
  const idToken = request.query["idToken"];
  const sessionCookie = request.cookies[sessionCookieName];
  try {
    let userID: string | null = null;
    if (idToken && typeof idToken === "string") {
      userID = await backend.auth.validateIDToken(idToken);
      const { sessionCookie, sessionCookieExpirationDate } =
        await backend.auth.createSessionCookie(idToken);
      response.cookie(
        sessionCookieName,
        sessionCookie,
        getSessionCookieOptions(sessionCookieExpirationDate),
      );
    } else if (sessionCookie) {
      userID = await backend.auth.validateSessionCookie(sessionCookie);
    }

    if (userID) {
      const customLoginToken = await backend.auth.createCustomLoginToken(
        userID,
      );
      response.send(customLoginToken);
    } else {
      response.status(400).send();
    }
  } catch (error) {
    console.trace("Encountered error while creating token", error);
    response.status(401).send(error);
  }
}
