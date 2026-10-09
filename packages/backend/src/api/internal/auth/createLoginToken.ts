import express from "express";
import { sharedServerDatabase } from "../../../db/index.js";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie.js";

export async function createLoginToken(
  request: express.Request,
  response: express.Response,
) {
  const idToken = idTokenFromAuthorization(request.header("Authorization"));
  const sessionCookie = request.cookies[sessionCookieName];
  const db = sharedServerDatabase();
  try {
    let userID: string | null = null;
    if (idToken) {
      userID = await db.auth.validateIDToken(idToken);
      const { sessionCookie, sessionCookieExpirationDate } =
        await db.auth.createSessionCookie(idToken);
      response.cookie(
        sessionCookieName,
        sessionCookie,
        getSessionCookieOptions(sessionCookieExpirationDate),
      );
    } else if (sessionCookie) {
      userID = await db.auth.validateSessionCookie(sessionCookie);
    }

    if (userID) {
      const customLoginToken = await db.auth.createCustomLoginToken(userID);
      response
        .set({
          "Cache-Control": "no-store, max-age=0",
          "Referrer-Policy": "no-referrer",
        })
        .send(customLoginToken);
    } else {
      response.status(401).send();
    }
  } catch {
    console.error("Encountered an error while creating a login token");
    response.status(401).send();
  }
}

function idTokenFromAuthorization(value: string | undefined) {
  return value?.match(/^ID ([^\s]+)$/)?.[1] ?? null;
}
