import { ContinueWithUser, styles } from "@withorbit/ui";
import React from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { AuthenticationClient } from "../../authentication/index.js";
import { useAuthenticationClient } from "../../authentication/authContext.js";
import { createLoginTokenBroadcastChannel } from "../../authentication/loginTokenBroadcastChannel.js";
import SignInForm from "../../signIn/SignInForm.js";

type LoginTokenTarget = "opener" | "channel";
function getCurrentLoginTokenTarget(): LoginTokenTarget | null {
  if (Platform.OS === "web") {
    const searchParams = new URLSearchParams(window.location.search);
    const openerTarget = searchParams.get("tokenTarget");
    if (openerTarget === "opener" || openerTarget === "channel") {
      return openerTarget;
    }
  }
  return null;
}

type SignInSubroute =
  | { path: "form" }
  | { path: "continue"; emailAddress: string }
  | null;

// If the user's already signed in, we'll confirm that they want to continue with that user; otherwise, we'll present a sign in form.
function useSignInSubroute(
  authenticationClient: AuthenticationClient,
): SignInSubroute {
  const [state, setState] = React.useState<SignInSubroute>(null);

  React.useEffect(() => {
    const unsubscribe = authenticationClient.subscribeToUserAuthState(
      (record) => {
        if (record) {
          if (!record.emailAddress) {
            throw new Error(
              "Unexpected: user exists but doesn't have an email address",
            );
          }
          setState({ path: "continue", emailAddress: record.emailAddress });
        } else {
          setState({ path: "form" });
        }
        unsubscribe();
      },
    );
    return unsubscribe;
  }, [authenticationClient]);

  return state;
}

async function completeSignIn(authenticationClient: AuthenticationClient) {
  const tokenTarget = getCurrentLoginTokenTarget();
  if (tokenTarget) {
    const idToken = await authenticationClient.getCurrentIDToken();
    const loginToken =
      await authenticationClient.getLoginTokenUsingIDToken(idToken);

    if (tokenTarget === "opener") {
      if (window.opener) {
        const requestedOrigin = new URLSearchParams(window.location.search).get(
          "origin",
        );
        let origin;
        // HACK: Permitting cross-origin login for my prototype.
        if (
          requestedOrigin &&
          ((__DEV__ && requestedOrigin.startsWith("http://localhost")) ||
            requestedOrigin === "https://fall-2022-beta.withorbit.com")
        ) {
          origin = requestedOrigin;
        } else {
          origin = window.origin;
        }
        window.opener.postMessage({ loginToken }, origin);
      } else {
        throw new Error(
          "window.opener is unavailable: no way to pass the auth token",
        );
      }
    } else if (tokenTarget === "channel") {
      const channel = createLoginTokenBroadcastChannel();
      if (channel) {
        channel.postMessage({ loginToken });
      } else {
        throw new Error(
          "Login token broadcast channel is unavailable: no way to pass the auth token",
        );
      }
    } else {
      throw new Error(`Unknown login token target: ${tokenTarget}`);
    }

    window.close();
  } else {
    if (Platform.OS === "web") {
      // TODO: redirect somewhere useful outside the embedded case
      const continueURL = new URL(location.href).searchParams.get("continue");
      if (continueURL && new URL(continueURL).origin === location.origin) {
        location.href = continueURL;
      } else {
        location.pathname = "/";
      }
    }
  }
}

function getOverrideEmailAddress() {
  if (Platform.OS === "web") {
    const search = new URLSearchParams(location.search);
    return search.get("email");
  } else {
    return null;
  }
}

export default function Login() {
  const colorPalette: styles.colors.ColorPalette = styles.colors.palettes.red; // TODO;
  const overrideEmailAddress = React.useMemo(getOverrideEmailAddress, []);

  const authenticationClient = useAuthenticationClient();
  const signInSubroute = useSignInSubroute(authenticationClient);
  // TODO: consider reimplementing edge case where overrideEmailAddress doesn't match the signed in user

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colorPalette.backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {signInSubroute ? (
        signInSubroute.path === "form" ? (
          <SignInForm
            overrideEmailAddress={overrideEmailAddress}
            colorPalette={colorPalette}
            onComplete={() => completeSignIn(authenticationClient)}
          />
        ) : (
          <ContinueWithUser
            colorPalette={colorPalette}
            email={signInSubroute.emailAddress}
            onContinueWithUser={() => completeSignIn(authenticationClient)}
          />
        )
      ) : (
        <ActivityIndicator size="large" color={colorPalette.accentColor} />
      )}
    </View>
  );
}
