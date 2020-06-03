import { Authentication, getDefaultFirebaseApp } from "metabook-client";
import React from "react";
import SignInScreen from "./SignInScreen";

export default function Login() {
  const [authenticationClient] = React.useState(() => {
    const app = getDefaultFirebaseApp();
    return new Authentication.FirebaseAuthenticationClient(app.auth());
  });

  React.useEffect(() => {
    authenticationClient.subscribeToUserAuthState((userRecord) => {
      if (userRecord) {
        window.close();
      }
    });
  }, [authenticationClient]);

  return <SignInScreen authenticationClient={authenticationClient} />;
}
