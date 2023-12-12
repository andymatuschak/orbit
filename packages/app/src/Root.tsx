import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Authentication from "./authentication/index.js";
import { AuthenticationClientContext } from "./authentication/authContext.js";
import { getFirebaseAuth } from "./util/firebase.js";
import usePageViewTracking from "./util/usePageViewTracking.js";

enum RootScreen {
  Review = "Review",
  SignIn = "SignIn",
  Embed = "Embed",
  LearnMore = "LearnMore",
  TermsOfService = "TermsOfService",
  Settings = "Settings",
  Download = "Download",
}

function useNavigationState(): RootScreen {
  // TODO: Implement a real router.
  if (Platform.OS === "web") {
    const pathname = window.location.pathname;
    if (pathname.startsWith("/login")) {
      return RootScreen.SignIn;
    } else if (pathname.startsWith("/embed")) {
      return RootScreen.Embed;
    } else if (pathname.startsWith("/terms")) {
      return RootScreen.TermsOfService;
    } else if (pathname.startsWith("/settings")) {
      return RootScreen.Settings;
    } else if (pathname.startsWith("/download")) {
      return RootScreen.Download;
    } else if (pathname === "/") {
      return RootScreen.LearnMore;
    }
  }

  return RootScreen.Review;
}

// TODO: We should really separate the "web site" bits from the "Orbit web app" bits.
const screens: Record<
  RootScreen,
  () => Promise<{ default: React.ComponentType<any> }>
> = {
  [RootScreen.SignIn]: () => import("./signIn/SignInScreen"),
  [RootScreen.Review]: () => import("./reviewSession/ReviewSessionScreen"),
  [RootScreen.Embed]: () => import("./embedded/EmbeddedScreen"),
  [RootScreen.Settings]: () => import("./settings/SettingsScreen"),
  [RootScreen.LearnMore]: () => import("./learnMore/LearnMoreScreen"),
  [RootScreen.TermsOfService]: () => import("./terms/TermsOfServiceScreen"),
  [RootScreen.Download]: () => import("./download/DownloadScreen"),
};

function Lazy<T extends React.ComponentType<any>>(props: {
  load: () => Promise<{ default: T }>;
}) {
  const [component, setComponent] = useState<T | null>(null);

  const { load } = props;
  useEffect(() => {
    load().then((result) => {
      // console.log(result.default);
      setComponent(() => result.default);
    });
  }, [load]);

  return component ? React.createElement(component) : null;
}

export default function Root() {
  usePageViewTracking();
  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  const navigationState = useNavigationState();
  return (
    <AuthenticationClientContext.Provider value={authenticationClient}>
      <SafeAreaProvider>
        <Lazy load={screens[navigationState]} />
      </SafeAreaProvider>
    </AuthenticationClientContext.Provider>
  );
}
