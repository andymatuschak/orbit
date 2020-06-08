import { Authentication, getDefaultFirebaseApp } from "metabook-client";
import React from "react";
import SignInScreen from "./SignInScreen";

export default function Login({
  shouldSendOpenerLoginToken,
}: {
  shouldSendOpenerLoginToken: boolean;
}) {
  const [authenticationClient] = React.useState(() => {
    const app = getDefaultFirebaseApp();
    return new Authentication.FirebaseAuthenticationClient(app.auth());
  });

  React.useEffect(() => {
    authenticationClient.subscribeToUserAuthState(async (userRecord) => {
      if (userRecord) {
        if (shouldSendOpenerLoginToken) {
          // TODO error handling
          const idToken = await authenticationClient.getCurrentIDToken();
          const loginToken = await authenticationClient.getLoginTokenUsingIDToken(
            idToken,
          );
          console.log("Got login token", loginToken);

          if (!window.opener) {
            throw new Error(
              `shouldSendOpenerLoginToken is set but window.opener is unset`,
            );
          }
          window.opener.postMessage(loginToken, "https://embed.withorbit.com");
        }
        window.close();
      }
    });
  }, [authenticationClient, shouldSendOpenerLoginToken]);

  return <SignInScreen authenticationClient={authenticationClient} />;
}
