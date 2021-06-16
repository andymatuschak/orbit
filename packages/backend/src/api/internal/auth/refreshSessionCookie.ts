import express from "express";
import * as backend from "../../../backend";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie";

export async function refreshSessionCookie(
  request: express.Request,
  response: express.Response,
) {
  const idToken = request.query["idToken"];
  try {
    if (idToken && typeof idToken === "string") {
      await backend.auth.validateIDToken(idToken);
      const { sessionCookie, sessionCookieExpirationDate } =
        await backend.auth.createSessionCookie(idToken);
      response
        .cookie(
          sessionCookieName,
          sessionCookie,
          getSessionCookieOptions(sessionCookieExpirationDate),
        )
        .send();
    } else {
      response.status(400).send();
    }
    // Not worried about CSRF because the ID tokens never leave origin-locked storage
  } catch (error) {
    response.status(401).send(error);
  }
}
