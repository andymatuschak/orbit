import * as functions from "firebase-functions";
import { getAuthTokensForIDToken } from "../../firebase";

import corsHandler from "../corsHandler";
import { getSessionCookieOptions, sessionCookieName } from "./sessionCookie";

export default functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    const idToken = request.query["idToken"];
    try {
      if (idToken && typeof idToken === "string") {
        const {
          sessionCookie,
          sessionCookieExpirationDate,
        } = await getAuthTokensForIDToken(idToken);
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
    } catch (error) {
      response.status(401).send(error);
    }
  });
});
