import React from "react";
import { Alert, View } from "react-native";

import { SignInForm, SignInFormProps } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import { AuthenticationClient } from "./util/firebase";

interface SignInScreenProps {
  authenticationClient: AuthenticationClient;
}

export default function SignInScreen({
  authenticationClient,
}: SignInScreenProps) {
  const [formMode, setFormMode] = React.useState<SignInFormProps["mode"]>(null);
  const [isPendingServerResponse, setPendingServerResponse] = React.useState(
    false,
  );

  const onLogin = React.useCallback(
    async (email, password) => {
      setPendingServerResponse(true);
      switch (formMode) {
        case null:
          console.error("Can't login with unknown mode");
          break;
        case "signIn":
          try {
            const credential = await authenticationClient.signInWithEmailAndPassword(
              email,
              password,
            );
            console.log("Signed in:", credential);
          } catch (error) {
            console.error("Couldn't sign in", error.code, error.message);
            Alert.alert("There was a problem signing in", error.message);
          }
          break;
        case "register":
          try {
            const credential = await authenticationClient.createUserWithEmailAndPassword(
              email,
              password,
            );
            console.log("Registered:", credential);
          } catch (error) {
            console.error("Couldn't create account", error.code, error.message);
            Alert.alert(
              "There was a problem creating your account",
              error.message,
            );
          }
      }
      setPendingServerResponse(false);
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
