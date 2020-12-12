import { SignInForm, SignInFormProps, styles } from "metabook-ui";
import React from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { AuthenticationClient } from "../authentication";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../authentication/authContext";
import { getLoginTokenBroadcastChannel } from "../authentication/loginTokenBroadcastChannel";

function simpleAlert(text: string) {
  if (Platform.OS === "web") {
    alert(text);
  } else {
    Alert.alert(text);
  }
}

function shouldSendOpenerLoginToken() {
  return (
    Platform.OS === "web" &&
    window.location.search.includes("shouldSendOpenerLoginToken")
  );
}

async function sendTokenToOpenerAndClose(
  authenticationClient: AuthenticationClient,
) {
  const idToken = await authenticationClient.getCurrentIDToken();
  const loginToken = await authenticationClient.getLoginTokenUsingIDToken(
    idToken,
  );
  console.log("Got login token", loginToken);

  const channel = getLoginTokenBroadcastChannel();
  if (channel) {
    channel.postMessage({ loginToken });
  } else if (window.opener) {
    window.opener.postMessage({ loginToken });
  } else {
    throw new Error(
      "Login token broadcast channel is unavailable and there is no window.opener: no way to pass the auth token",
    );
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
      if (shouldSendOpenerLoginToken()) {
        sendTokenToOpenerAndClose(authenticationClient);
      } else {
        if (Platform.OS === "web") {
          // TODO: redirect somewhere useful outside the embedded case
          location.pathname = "/";
        }
      }
    }
  }, [authenticationClient, userRecord]);

  const isUnmounted = React.useRef(false);
  React.useEffect(() => {
    return () => {
      isUnmounted.current = true;
    };
  }, []);

  const onLogin = React.useCallback(
    async (email, password) => {
      setPendingServerResponse(true);

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
        if (isUnmounted.current) {
          return;
        }
        console.error("Couldn't login", error.code, error.message);
        // TODO: replace with inline error
        simpleAlert(error.message);
      }
      if (!isUnmounted.current) {
        setPendingServerResponse(false);
      }
    },
    [authenticationClient, formMode],
  );

  const onResetPassword = React.useCallback(
    (email) => {
      authenticationClient.sendPasswordResetEmail(email);
      simpleAlert(
        "We've sent you an email with instructions on how to reset your password.",
      );
    },
    [authenticationClient],
  );

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
        <SignInForm
          overrideEmailAddress={overrideEmailAddress}
          onSubmit={onLogin}
          onResetPassword={onResetPassword}
          mode={formMode}
          isPendingServerResponse={isPendingServerResponse}
          colorPalette={colorPalette}
        />
      ) : (
        <ActivityIndicator size="large" color={colorPalette.accentColor} />
      )}
    </View>
  );
}
