import {
  ContinueWithUser,
  SignInForm,
  SignInFormProps,
  styles,
} from "@withorbit/ui";
import React from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { AuthenticationClient } from "../authentication";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../authentication/authContext";
import { createLoginTokenBroadcastChannel } from "../authentication/loginTokenBroadcastChannel";

function showSimpleAlert(text: string) {
  if (Platform.OS === "web") {
    alert(text);
  } else {
    Alert.alert(text);
  }
}

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

async function sendTokenToTargetAndClose(
  authenticationClient: AuthenticationClient,
  loginTokenTarget: LoginTokenTarget,
) {
  const idToken = await authenticationClient.getCurrentIDToken();
  const loginToken = await authenticationClient.getLoginTokenUsingIDToken(
    idToken,
  );
  console.log("Got login token", loginToken);

  if (loginTokenTarget === "opener") {
    if (window.opener) {
      window.opener.postMessage({ loginToken }, window.origin);
    } else {
      throw new Error(
        "window.opener is unavailable: no way to pass the auth token",
      );
    }
  } else if (loginTokenTarget === "channel") {
    const channel = createLoginTokenBroadcastChannel();
    if (channel) {
      channel.postMessage({ loginToken });
    } else {
      throw new Error(
        "Login token broadcast channel is unavailable: no way to pass the auth token",
      );
    }
  } else {
    throw new Error(`Unknown login token target: ${loginTokenTarget}`);
  }

  window.close();
}

export default function SignInScreen() {
  const colorPalette: styles.colors.ColorPalette = styles.colors.palettes.red; // TODO;
  const overrideEmailAddress: string | null = React.useMemo(() => {
    if (Platform.OS === "web") {
      const search = new URLSearchParams(location.search);
      return search.get("email");
    } else {
      return null;
    }
  }, []);

  const authenticationClient = useAuthenticationClient();
  const [formMode, setFormMode] = React.useState<
    SignInFormProps["mode"] | null
  >(!!overrideEmailAddress ? null : "signIn");
  const [isPendingServerResponse, setPendingServerResponse] = React.useState(
    false,
  );
  const [automaticLoginState, setAutomaticLoginState] = React.useState<
    "requiresUserApproval" | "approved" | null
  >(null);

  // If we have an override email address, figure out whether that account exists.
  React.useEffect(() => {
    if (overrideEmailAddress) {
      authenticationClient
        .userExistsWithEmail(overrideEmailAddress)
        .then((userExists) => setFormMode(userExists ? "signIn" : "register"))
        .catch((error) =>
          // TODO: reroute to full login sequence
          console.error("Couldn't determine if user exists", error),
        );
    }
  }, [authenticationClient, overrideEmailAddress]);

  const userRecord = useCurrentUserRecord(authenticationClient);

  React.useEffect(() => {
    if (userRecord) {
      const tokenTarget = getCurrentLoginTokenTarget();
      if (tokenTarget) {
        if (automaticLoginState === "approved") {
          sendTokenToTargetAndClose(authenticationClient, tokenTarget);
        } else if (automaticLoginState === null) {
          // a user record was received before the user entered their credentials
          // lets double check they want to use this account
          setAutomaticLoginState("requiresUserApproval");
        } else if (userRecord.emailAddress !== overrideEmailAddress) {
          authenticationClient.signOut();
          setAutomaticLoginState(null);
        }
      } else {
        if (Platform.OS === "web") {
          // TODO: redirect somewhere useful outside the embedded case
          const continueURL = new URL(location.href).searchParams.get(
            "continue",
          );
          if (continueURL && new URL(continueURL).origin === location.origin) {
            location.href = continueURL;
          } else {
            location.pathname = "/";
          }
        }
      }
    }
  }, [
    authenticationClient,
    userRecord,
    automaticLoginState,
    overrideEmailAddress,
  ]);

  const onLogin = React.useCallback(
    async (email, password) => {
      setPendingServerResponse(true);
      setAutomaticLoginState("approved");

      try {
        switch (formMode) {
          case "signIn":
            await authenticationClient.signInWithEmailAndPassword(
              email,
              password,
            );
            break;
          case "register":
            await authenticationClient.createUserWithEmailAndPassword(
              email,
              password,
            );
            break;
        }
      } catch (error) {
        console.error("Couldn't login", error.code, error.message);
        // TODO: replace with inline error
        showSimpleAlert(error.message);
      }
      setPendingServerResponse(false);
    },
    [authenticationClient, formMode],
  );

  const onResetPassword = React.useCallback(
    (email) => {
      authenticationClient.sendPasswordResetEmail(email);
      showSimpleAlert(
        "We've sent you an email with instructions on how to reset your password.",
      );
    },
    [authenticationClient],
  );

  const onContinueWithUser = React.useCallback(() => {
    setAutomaticLoginState("approved");
  }, []);

  const continueWithUserEmail = (() => {
    if (automaticLoginState === "requiresUserApproval") {
      if (userRecord?.emailAddress) {
        return userRecord.emailAddress;
      }
      throw new Error("A user without an associated email has been found");
    }
    return null;
  })();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colorPalette.backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {formMode ? (
        continueWithUserEmail ? (
          <ContinueWithUser
            colorPalette={colorPalette}
            email={continueWithUserEmail}
            onContinueWithUser={onContinueWithUser}
          />
        ) : (
          <SignInForm
            overrideEmailAddress={overrideEmailAddress}
            onSubmit={onLogin}
            onResetPassword={onResetPassword}
            mode={formMode}
            isPendingServerResponse={isPendingServerResponse}
            colorPalette={colorPalette}
          />
        )
      ) : (
        <ActivityIndicator size="large" color={colorPalette.accentColor} />
      )}
    </View>
  );
}
