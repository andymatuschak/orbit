import React from "react";
import { Platform } from "react-native";
import { AuthenticationClient } from "../authentication";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../authentication/authContext.js";
import SignInScreen from "../signIn/SignInScreen.js";
import { LoadingScreen } from "./LoadingScreen.js";
import ReviewSession from "./ReviewSession.js";

function extractAccessCode(): string | null {
  if (Platform.OS === "web") {
    const currentURL = new URL(location.href);
    const accessCode = currentURL.searchParams.get("accessCode");
    if (accessCode) {
      currentURL.searchParams.delete("accessCode");
      history.replaceState(null, "", currentURL.toString());
    }
    return accessCode;
  } else {
    return null;
  }
}

async function loginWithAccessCode(
  accessCode: string,
  authenticationClient: AuthenticationClient,
): Promise<void> {
  const loginToken = await authenticationClient
    .getLoginTokenUsingAccessCode(accessCode)
    .catch(() => null);
  const authState = await authenticationClient.getUserAuthState();
  if (!authState && loginToken) {
    console.log("Signing in with access code");
    await authenticationClient.signInWithLoginToken(loginToken);
  }
}

function useAccessCode(authenticationClient: AuthenticationClient): boolean {
  const [isPendingAccessCode, setPendingAccessCode] = React.useState(true);
  React.useEffect(() => {
    if (Platform.OS === "web") {
      const accessCode = extractAccessCode();
      setPendingAccessCode(!!accessCode);
      if (accessCode) {
        loginWithAccessCode(accessCode, authenticationClient);
      }
    } else {
      setPendingAccessCode(false);
    }
  }, [authenticationClient]);
  return isPendingAccessCode;
}

export default function ReviewSessionScreen() {
  const authenticationClient = useAuthenticationClient();
  const isPendingAccessCode = useAccessCode(authenticationClient);
  const userRecord = useCurrentUserRecord(authenticationClient);

  if (userRecord) {
    return <ReviewSession />;
  } else if (userRecord === null && !isPendingAccessCode) {
    return <SignInScreen />;
  } else {
    return <LoadingScreen />;
  }
}
