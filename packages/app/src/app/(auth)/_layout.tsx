import { Slot } from "expo-router";
import React, { useState } from "react";
import { AuthenticationClientContext } from "../../authentication/authContext.js";
import * as Authentication from "../../authentication/index.js";
import { getFirebaseAuth } from "../../util/firebaseAuth.js";

export default function RootLayout() {
  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  return (
    <AuthenticationClientContext.Provider value={authenticationClient}>
      <Slot />
    </AuthenticationClientContext.Provider>
  );
}
