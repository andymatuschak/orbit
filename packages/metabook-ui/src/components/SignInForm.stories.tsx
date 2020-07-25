import React from "react";
import { View } from "react-native";
import * as colors from "../styles/colors";
import SignInForm, { SignInFormProps } from "./SignInForm";

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
