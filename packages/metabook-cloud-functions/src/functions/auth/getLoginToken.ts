import cookieParser from "cookie-parser";
import * as functions from "firebase-functions";
import {
  getAuthTokensForIDToken,
  getCustomLoginTokenForSessionCookie,
} from "../../firebase";
import corsHandler from "./corsHandler";
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
          } = await getAuthTokensForIDToken(idToken);
          response
            .cookie(
              sessionCookieName,
              sessionCookie,
              getSessionCookieOptions(sessionCookieExpirationDate),
            )
            .send(customLoginToken);
        } else if (sessionCookie) {
          const customLoginToken = await getCustomLoginTokenForSessionCookie(
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
