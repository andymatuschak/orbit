import isEmail from "isemail";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from "react-native";
import { colors, type, layout } from "../styles";
import Button from "./Button";
import Logo from "./Logo";
import Spacer from "./Spacer";
import TextInput, { textFieldHorizontalPadding } from "./TextInput";
import { IconName } from "./Icon";

export interface SignInFormProps {
  mode: "signIn" | "register";
  onSubmit: (email: string, password: string) => void;
  onResetPassword?: (email: string) => void;
  isPendingServerResponse: boolean;
  colorPalette: colors.ColorPalette;
  overrideEmailAddress?: string | null;
}

export default function SignInForm({
  onSubmit,
  onResetPassword,
  mode,
  isPendingServerResponse,
  overrideEmailAddress,
  colorPalette,
}: SignInFormProps) {
  const [email, setEmail] = React.useState(overrideEmailAddress ?? "");
  const [password, setPassword] = React.useState("");

  const hasValidFormEntries = React.useMemo(() => {
    if (!email || !password) {
      return false;
    }
    return isEmail.validate(email);
  }, [email, password]);

  const onPressSubmit = React.useCallback(() => {
    onSubmit(email, password);
  }, [onSubmit, email, password]);

  const passwordInputRef = React.useRef<RNTextInput>(null);
  const onSubmitEmail = React.useCallback(() => {
    passwordInputRef.current?.focus();
  }, []);

  const [hasResetPassword, setHasResetPassword] = React.useState(false);
  const onResetPasswordButton = React.useCallback(() => {
    setHasResetPassword(true);
    onResetPassword?.(email);
  }, [onResetPassword, email]);

  const buttonTitle = mode === "signIn" ? "Sign in" : "Create account";

  const flexibleSpacer = <View style={{ flex: 1 }} />;

  return (
    <View style={styles.container}>
      <Logo units={3} style={{ tintColor: colorPalette.secondaryTextColor }} />
      {flexibleSpacer}
      <Text style={type.headline.layoutStyle}>
        {mode === "signIn" ? "Sign in" : "Sign up to remember what you read."}
      </Text>
      <Spacer units={5} />
      <Text style={styles.label}>Email address</Text>
      <Spacer units={1} />
      {overrideEmailAddress ? (
        <>
          <Text
            style={[
              type.label.layoutStyle,
              { color: colorPalette.secondaryTextColor },
            ]}
          >
            {overrideEmailAddress}
          </Text>
          {Platform.OS === "web" && (
            // Help out the password managesr.
            <input
              style={{ display: "none" }}
              type="text"
              name="email"
              id="email"
              autoComplete="username"
              value={overrideEmailAddress}
              readOnly
            />
          )}
        </>
      ) : (
        <TextInput
          style={styles.textInput}
          colorPalette={colorPalette}
          onChangeText={setEmail}
          value={email}
          placeholder="Email address"
          autoCorrect={false}
          importantForAutofill="yes"
          autoCompleteType="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          onSubmitEditing={onSubmitEmail}
          returnKeyType={"next"}
        />
      )}
      <Spacer units={3.5} />
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <Text style={styles.label}>Password</Text>
        {mode === "signIn" &&
          onResetPassword &&
          (hasResetPassword ? (
            <Text style={[type.labelTiny.layoutStyle, { color: colors.ink }]}>
              We&rsquo;ve emailed you a link to reset your password.
            </Text>
          ) : (
            <Button
              size="small"
              onPress={onResetPasswordButton}
              title="Forgot your password?"
              color={colorPalette.accentColor}
              hitSlop={40}
            />
          ))}
      </View>
      <Spacer units={1} />
      <TextInput
        style={styles.textInput}
        colorPalette={colorPalette}
        ref={passwordInputRef}
        onChangeText={setPassword}
        value={password}
        placeholder="Password"
        autoCorrect={false}
        importantForAutofill="yes"
        autoCompleteType="password"
        textContentType={mode === "register" ? "newPassword" : "password"}
        secureTextEntry={true}
        onSubmitEditing={onPressSubmit}
        returnKeyLabel={buttonTitle}
        returnKeyType="done"
      />
      {flexibleSpacer}
      <View style={{ position: "relative" }}>
        <Button
          color={colors.white}
          accentColor={colorPalette.accentColor}
          iconName={IconName.ArrowRight}
          title={buttonTitle}
          onPress={onPressSubmit}
        />
        <View style={styles.indicatorContainer}>
          <ActivityIndicator
            animating={
              isPendingServerResponse || (hasValidFormEntries && mode === null)
            }
            color={colorPalette.accentColor}
          />
        </View>
      </View>
      {mode === "register" && (
        <Text
          style={[
            type.labelTiny.layoutStyle,
            {
              marginTop: layout.gridUnit * 2,
              color: colorPalette.secondaryTextColor,
            },
          ]}
        >
          By signing up for Orbit, you confirm that you have read and agree to
          Orbit’s Terms of Service, and you are at least 16 years of age.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxWidth: 375,
    maxHeight: 500,
    flex: 1,
    width: "100%",
  },

  textInput: {
    marginLeft: -textFieldHorizontalPadding,
    marginRight: -textFieldHorizontalPadding,
  },

  label: {
    ...type.labelSmall.layoutStyle,
    color: colors.white,
  },

  indicatorContainer: {
    position: "absolute",
    right: 0,
    bottom: layout.gridUnit * 2,
  },
});
