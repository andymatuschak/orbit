import cookieParser from "cookie-parser";
import * as functions from "firebase-functions";
import * as backend from "../../backend";
import corsHandler from "../util/corsHandler";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie";

const cookieParserHandler = cookieParser();

export default functions.https.onRequest((request, response) => {
  cookieParserHandler(request, response, () => {
    corsHandler(request, response, async () => {
      const idToken = request.query["idToken"];
      const sessionCookie = request.cookies[sessionCookieName];
      try {
        if (idToken && typeof idToken === "string") {
          const {
            sessionCookie,
            customLoginToken,
            sessionCookieExpirationDate,
          } = await backend.auth.getAuthTokensForIDToken(idToken);
          response
            .cookie(
              sessionCookieName,
              sessionCookie,
              getSessionCookieOptions(sessionCookieExpirationDate),
            )
            .send(customLoginToken);
        } else if (sessionCookie) {
          const customLoginToken = await backend.auth.getCustomLoginTokenForSessionCookie(
            sessionCookie,
          );
          response.send(customLoginToken);
        }
        // Not worried about CSRF because the ID tokens never leave origin-locked storage
      } catch (error) {
        response.status(401).send(error);
      }
    });
  });
});
