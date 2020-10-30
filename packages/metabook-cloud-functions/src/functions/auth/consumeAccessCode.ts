import * as functions from "firebase-functions";
import * as backend from "../../backend";
import corsHandler from "../util/corsHandler";

export const consumeAccessCode = functions.https.onRequest(
  (request, response) => {
    corsHandler(request, response, async () => {
      const accessCode = request.query["accessCode"];
      if (accessCode && typeof accessCode === "string") {
        try {
          const loginToken = await backend.auth.exchangeAccessCodeForCustomLoginToken(
            accessCode,
            Date.now(),
          );
          response.send(loginToken);
        } catch (error) {
          console.error(`Couldn't consume access code ${accessCode}: ${error}`);
          response.status(403).send();
        }
      } else {
        response.status(400).send("Missing access code");
      }
    });
  },
);
