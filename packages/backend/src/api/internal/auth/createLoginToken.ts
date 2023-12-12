import express from "express";
import { sharedServerDatabase } from "../../../db/index.js";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie.js";

export async function createLoginToken(
  request: express.Request,
  response: express.Response,
) {
  const idToken = request.query["idToken"];
  const sessionCookie = request.cookies[sessionCookieName];
  const db = sharedServerDatabase();
  try {
    let userID: string | null = null;
    if (idToken && typeof idToken === "string") {
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
      response.send(customLoginToken);
    } else {
      response.status(400).send();
    }
  } catch (error) {
    console.trace("Encountered error while creating token", error);
    response.status(401).send(error);
  }
}
