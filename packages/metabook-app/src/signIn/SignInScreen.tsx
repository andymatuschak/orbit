import { SignInForm, SignInFormProps, styles } from "metabook-ui";
import React from "react";
import { ActivityIndicator, Alert, Platform, View } from "react-native";
import { AuthenticationClient } from "../authentication";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../util/authContext";

function shouldSendOpenerLoginToken() {
  return (
    Platform.OS === "web" &&
    window.location.search.includes("shouldSendOpenerLoginToken")
  );
}

async function sendTokenToOpenerAndClose(
  authenticationClient: AuthenticationClient,
) {
  // TODO error handling
  const idToken = await authenticationClient.getCurrentIDToken();
  const loginToken = await authenticationClient.getLoginTokenUsingIDToken(
    idToken,
  );
  console.log("Got login token", loginToken);

  if (!window.opener) {
    throw new Error(
      `shouldSendOpenerLoginToken is set but window.opener is unset`,
    );
  }
  window.opener.postMessage({ loginToken }, "https://app.withorbit.com");
  window.close();
}

export default function SignInScreen() {
  const colorPalette: styles.colors.ColorPalette = styles.colors.palettes[0];
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
        // TODO: redirect or something outside the embedded case
        if (Platform.OS === "web") {
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
        Alert.alert("There was a problem signing in", error.message);
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
      Alert.alert(
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
        paddingLeft: styles.layout.edgeMargin,
        paddingRight: styles.layout.edgeMargin,
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
