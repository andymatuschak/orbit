import { SignInForm, SignInFormProps, styles } from "metabook-ui";
import React from "react";
import { Alert, Platform, View } from "react-native";
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
  const authenticationClient = useAuthenticationClient();

  const userRecord = useCurrentUserRecord(authenticationClient);
  React.useEffect(() => {
    if (userRecord) {
      if (shouldSendOpenerLoginToken()) {
        sendTokenToOpenerAndClose(authenticationClient);
      } // TODO: redirect or something outside the embedded case
    }
  }, [authenticationClient, userRecord]);

  const [formMode, setFormMode] = React.useState<SignInFormProps["mode"]>(null);
  const [isPendingServerResponse, setPendingServerResponse] = React.useState(
    false,
  );

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
          case null:
            console.error("Can't login with unknown mode");
            break;
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

  const onDidChangeEmail = React.useCallback(
    async (email) => {
      setFormMode(null);
      try {
        const userExists = await authenticationClient.userExistsWithEmail(
          email,
        );
        setFormMode(userExists ? "signIn" : "register");
      } catch (error) {
        console.warn("Invalid email", email, error.code, error.message);
      }
    },
    [authenticationClient],
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: styles.colors.palettes[0].backgroundColor, // TODO
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 500,
          flex: 1,
          justifyContent: "center",
          marginLeft: styles.layout.gridUnit,
          marginRight: styles.layout.gridUnit,
        }}
      >
        <SignInForm
          onSubmit={onLogin}
          mode={formMode}
          onChangeEmail={onDidChangeEmail}
          isPendingServerResponse={isPendingServerResponse}
        />
      </View>
    </View>
  );
}
