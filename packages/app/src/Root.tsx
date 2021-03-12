import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Authentication from "./authentication";
import { AuthenticationClientContext } from "./authentication/authContext";
import { getFirebaseAuth } from "./util/firebase";
import usePageViewTracking from "./util/usePageViewTracking";

enum RootScreen {
  Review = "Review",
  SignIn = "SignIn",
  Embed = "Embed",
  LearnMore = "LearnMore",
  TermsOfService = "TermsOfService",
  Settings = "Settings",
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
    } else if (pathname.startsWith("/settings")) {
      return RootScreen.Settings;
    } else if (pathname === "/") {
      return RootScreen.LearnMore;
    }
  }

  return RootScreen.Review;
}

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
