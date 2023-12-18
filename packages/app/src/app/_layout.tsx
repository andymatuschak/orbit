import "../shims.js";

import { Slot } from "expo-router";
import React, { useState } from "react";
import { Platform } from "react-native";
import { AuthenticationClientContext } from "../authentication/authContext";
import * as Authentication from "../authentication/index";
import { initializeReporter } from "../errorReporting";
import { getFirebaseAuth } from "../util/firebaseAuth";
import usePageViewTracking from "../util/usePageViewTracking";

if (Platform.OS === "ios" || Platform.OS === "macos") {
  // TODO 2023-12-15
  // initIntentHandlers();
}

export default function RootLayout() {
  usePageViewTracking();
  React.useEffect(() => {
    initializeReporter();
  }, []);

  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  return (
    <AuthenticationClientContext.Provider value={authenticationClient}>
      <Slot />
    </AuthenticationClientContext.Provider>
  );
}
