import express from "express";
import { sharedServerDatabase } from "../../../db/index.js";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie.js";

export async function refreshSessionCookie(
  request: express.Request,
  response: express.Response,
) {
  const idToken = request.query["idToken"];
  const db = sharedServerDatabase();
  try {
    if (idToken && typeof idToken === "string") {
      await db.auth.validateIDToken(idToken);
      const { sessionCookie, sessionCookieExpirationDate } =
        await db.auth.createSessionCookie(idToken);
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
