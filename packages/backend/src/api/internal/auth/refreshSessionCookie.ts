import express from "express";
import { sharedServerDatabase } from "../../../db/index.js";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie.js";

export async function refreshSessionCookie(
  request: express.Request,
  response: express.Response,
) {
  const idToken = request.header("Authorization")?.match(/^ID ([^\s]+)$/)?.[1];
  const db = sharedServerDatabase();
  try {
    if (idToken) {
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
      response.status(401).send();
    }
    // Not worried about CSRF because the ID tokens never leave origin-locked storage
  } catch {
    response.status(401).send();
  }
}
