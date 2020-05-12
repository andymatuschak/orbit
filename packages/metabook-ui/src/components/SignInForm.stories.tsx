import { getDefaultFirebaseApp } from "metabook-client";
import React from "react";
import { Alert, View } from "react-native";
import colors from "../styles/colors";
import SignInForm, { SignInFormProps } from "./SignInForm";

import "firebase/auth";

// noinspection JSUnusedGlobalSymbols
import ReviewArea from "./ReviewArea";

export default {
  title: "SignInForm",
  component: SignInForm,
};

export function Local() {
  const [formMode, setFormMode] = React.useState<SignInFormProps["mode"]>(null);
  const [isPendingServerResponse, setPendingServerResponse] = React.useState(
    false,
  );

  const onLogin = React.useCallback(() => {
    setPendingServerResponse(true);
    setTimeout(() => {
      setPendingServerResponse(false);
      console.log("Signed in!");
    }, 2000);
  }, []);

  const onDidChangeEmail = React.useCallback(() => {
    setTimeout(() => {
      setFormMode("register");
    }, 2000);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.key00,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <View style={{ width: "100%", maxWidth: 500 }}>
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

export function Firebase() {
  const [auth] = React.useState(() => getDefaultFirebaseApp().auth());
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
            const credential = await auth.signInWithEmailAndPassword(
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
            const credential = await auth.createUserWithEmailAndPassword(
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
    [auth, formMode],
  );

  const onDidChangeEmail = React.useCallback(
    async (email) => {
      setFormMode(null);
      try {
        const methods = await auth.fetchSignInMethodsForEmail(email);
        console.log("Methods", methods);
        // TODO fix potential race
        setFormMode(methods.length > 0 ? "signIn" : "register");
      } catch (error) {
        console.warn("Invalid email", email, error.code, error.message);
      }
    },
    [auth],
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
      <View style={{ width: "100%", maxWidth: 500 }}>
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
