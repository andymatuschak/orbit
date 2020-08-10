import * as Authentication from "./authentication";
import { styles } from "metabook-ui";
import React, { useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import {
  AuthenticationClientContext,
  useCurrentUserRecord,
} from "./util/authContext";
import { getFirebaseAuth } from "./util/firebase";
import { SafeAreaProvider } from "react-native-safe-area-context";

enum RootScreen {
  Loading = "Loading",
  Review = "Review",
  SignIn = "SignIn",
  Embed = "Embed",
}

function useNavigationState(
  authenticationClient: Authentication.AuthenticationClient,
): RootScreen {
  const userRecord = useCurrentUserRecord(authenticationClient);

  if (Platform.OS === "web") {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/login")) {
      return RootScreen.SignIn;
    } else if (pathname.startsWith("/embed")) {
      return RootScreen.Embed;
    }
  }

  if (userRecord) {
    return RootScreen.Review;
  } else if (userRecord === null) {
    return RootScreen.SignIn;
  } else {
    return RootScreen.Loading;
  }
}

const SignInScreen = React.lazy(() => import("./signIn/SignInScreen"));
const ReviewSessionScreen = React.lazy(() =>
  import("./reviewSession/ReviewSession"),
);
const EmbedScreen = React.lazy(() => import("./embedded/EmbeddedScreen"));
const LoadingScreen = () => (
  // TODO https://github.com/andymatuschak/metabook/issues/63
  <View style={{ flex: 1, justifyContent: "center" }}>
    <ActivityIndicator size="large" color={styles.colors.fg[0]} />
  </View>
);
const screens: Record<RootScreen, React.ComponentType<unknown>> = {
  [RootScreen.SignIn]: SignInScreen,
  [RootScreen.Review]: ReviewSessionScreen,
  [RootScreen.Embed]: EmbedScreen,
  [RootScreen.Loading]: LoadingScreen,
};

export default function Root() {
  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );

  const navigationState = useNavigationState(authenticationClient);
  const screen = React.useMemo(
    () => React.createElement(screens[navigationState]),
    [navigationState],
  );
  return (
    <AuthenticationClientContext.Provider value={authenticationClient}>
      <SafeAreaProvider>
        <React.Suspense fallback={null}>{screen}</React.Suspense>
      </SafeAreaProvider>
    </AuthenticationClientContext.Provider>
  );
}
