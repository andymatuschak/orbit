import React, { useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Authentication from "./authentication";
import { AuthenticationClientContext } from "./util/authContext";
import { getFirebaseAuth } from "./util/firebase";
import usePageViewTracking from "./util/usePageViewTracking";

enum RootScreen {
  Review = "Review",
  SignIn = "SignIn",
  Embed = "Embed",
  LearnMore = "LearnMore",
  TermsOfService = "TermsOfService",
}

function useNavigationState(): RootScreen {
  if (Platform.OS === "web") {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/login")) {
      return RootScreen.SignIn;
    } else if (pathname.startsWith("/embed")) {
      return RootScreen.Embed;
    } else if (pathname.startsWith("/terms")) {
      return RootScreen.TermsOfService;
    } else if (pathname === "/") {
      return RootScreen.LearnMore;
    }
  }

  return RootScreen.Review;
}

const SignInScreen = React.lazy(() => import("./signIn/SignInScreen"));
const ReviewSessionScreen = React.lazy(
  () => import("./reviewSession/ReviewSessionScreen"),
);
const EmbedScreen = React.lazy(() => import("./embedded/EmbeddedScreen"));
const LearnMoreScreen = React.lazy(() => import("./learnMore/LearnMoreScreen"));
const TermsOfServiceScreen = React.lazy(
  () => import("./terms/TermsOfServiceScreen"),
);
const screens: Record<RootScreen, React.ComponentType<unknown>> = {
  [RootScreen.SignIn]: SignInScreen,
  [RootScreen.Review]: ReviewSessionScreen,
  [RootScreen.Embed]: EmbedScreen,
  [RootScreen.LearnMore]: LearnMoreScreen,
  [RootScreen.TermsOfService]: TermsOfServiceScreen,
};

export default function Root() {
  usePageViewTracking();

  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  const navigationState = useNavigationState();

  return (
    <AuthenticationClientContext.Provider value={authenticationClient}>
      <SafeAreaProvider>
        <React.Suspense fallback={null}>
          {React.createElement(screens[navigationState])}
        </React.Suspense>
      </SafeAreaProvider>
    </AuthenticationClientContext.Provider>
  );
}
