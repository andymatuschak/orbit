import { spacing } from "metabook-ui/dist/styles/layout";
import React from "react";
import { Alert, View } from "react-native";

import { SignInForm, SignInFormProps } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import { Authentication } from "metabook-client";

interface SignInScreenProps {
  authenticationClient: Authentication.AuthenticationClient;
}

export default function SignInScreen({
  authenticationClient,
}: SignInScreenProps) {
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
        backgroundColor: colors.key00,
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
          marginLeft: spacing.spacing05,
          marginRight: spacing.spacing05,
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
