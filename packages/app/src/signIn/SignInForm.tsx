import {
  Button,
  IconName,
  Link,
  Logo,
  Spacer,
  styles,
  textFieldHorizontalPadding,
  TextInput,
} from "@withorbit/ui";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from "react-native";
import { useAuthenticationClient } from "../authentication/authContext.js";

function showSimpleAlert(text: string) {
  if (Platform.OS === "web") {
    alert(text);
  } else {
    Alert.alert(text);
  }
}

export interface SignInFormProps {
  colorPalette: styles.colors.ColorPalette;
  overrideEmailAddress?: string | null;
  onComplete: () => void;
}
type SignInFormMode = "pending" | "emailEntry" | "signIn" | "register";

export default function SignInForm({
  overrideEmailAddress,
  colorPalette,
  onComplete,
}: SignInFormProps) {
  const authenticationClient = useAuthenticationClient();

  const [email, setEmail] = useState(overrideEmailAddress ?? "");
  const [password, setPassword] = useState("");
  const [isPendingServerResponse, setPendingServerResponse] = useState(false);
  const [formMode, setFormMode] = useState<SignInFormMode>(
    overrideEmailAddress ? "pending" : "emailEntry",
  );

  const presentFormForEmail = useCallback(
    (email: string) => {
      setPendingServerResponse(true);
      authenticationClient
        .userExistsWithEmail(email)
        .then((userExists) => setFormMode(userExists ? "signIn" : "register"))
        .catch((error) => {
          // TODO: reroute to full login sequence
          console.error("Couldn't determine if user exists", error);
          showSimpleAlert("We couldn't sign you in. Please try again later.");
        })
        .finally(() => setPendingServerResponse(false));
    },
    [authenticationClient],
  );

  // If we have an override email address, figure out whether that account exists.
  useEffect(() => {
    if (overrideEmailAddress) {
      presentFormForEmail(overrideEmailAddress);
    }
  }, [presentFormForEmail, overrideEmailAddress]);

  const passwordInputRef = useRef<RNTextInput>(null);

  function onResetPassword() {
    authenticationClient.sendPasswordResetEmail(email);
    showSimpleAlert(
      "We've sent you an email with instructions on how to reset your password.",
    );
  }

  async function onSubmitForm() {
    setPendingServerResponse(true);
    try {
      if (formMode === "signIn") {
        await authenticationClient.signInWithEmailAndPassword(email, password);
      } else if (formMode === "register") {
        await authenticationClient.createUserWithEmailAndPassword(
          email,
          password,
        );
      }
      onComplete();
    } catch (error) {
      console.error("Couldn't login", error);
      // TODO: replace with inline error
      showSimpleAlert(error instanceof Error ? error.message : String(error));
    }
    setPendingServerResponse(false);
  }

  if (formMode === "pending") {
    return (
      <View style={{ flex: 1, width: "100%" }}>
        <ActivityIndicator size="large" color={colorPalette.accentColor} />
      </View>
    );
  }

  let formContentsNode;
  // TODO PENDING
  if (formMode === "emailEntry") {
    formContentsNode = (
      <>
        <TextInput
          style={formStyles.textInput}
          colorPalette={colorPalette}
          onChangeText={setEmail}
          value={email}
          placeholder="Enter your email address."
          autoCorrect={false}
          importantForAutofill="yes"
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          onSubmitEditing={async function () {
            presentFormForEmail(email);
          }}
          returnKeyType={"next"}
        />
        <Spacer units={7} />
        <View style={{ position: "relative" }}>
          <Button
            color={styles.colors.white}
            accentColor={colorPalette.accentColor}
            iconName={IconName.ArrowRight}
            title="Continue"
            onPress={async function () {
              presentFormForEmail(email);
            }}
          />
          <View style={formStyles.indicatorContainer}>
            <ActivityIndicator
              animating={isPendingServerResponse}
              color={colorPalette.accentColor}
            />
          </View>
        </View>
      </>
    );
  } else if (formMode === "signIn" || formMode === "register") {
    const buttonTitle = formMode === "signIn" ? "Sign in" : "Create account";
    formContentsNode = (
      <>
        <Text
          style={[
            styles.type.label.typeStyle,
            { color: colorPalette.secondaryTextColor },
          ]}
        >
          {overrideEmailAddress ?? email}
        </Text>
        {Platform.OS === "web" && (
          // Help out the password managesr.
          <input
            style={{ display: "none" }}
            type="text"
            name="email"
            id="email"
            autoComplete="username"
            value={overrideEmailAddress ?? email}
            readOnly
          />
        )}
        {formMode === "signIn" ? (
          <Spacer units={3.5} />
        ) : (
          <>
            <Spacer units={6} />
            <Text style={formStyles.loginInstructionsLabel}>
              That email address is new to us. Let&rsquo;s make you a new
              account.
            </Text>
            <Spacer units={3} />
          </>
        )}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <Text style={formStyles.label}>Password</Text>
          {formMode === "signIn" && (
            <Button
              size="tiny"
              onPress={onResetPassword}
              title="Forgot your password?"
              color={colorPalette.accentColor}
              hitSlop={40}
            />
          )}
        </View>
        <Spacer units={1} />
        <TextInput
          style={formStyles.textInput}
          colorPalette={colorPalette}
          ref={passwordInputRef}
          onChangeText={setPassword}
          value={password}
          placeholder="Password"
          autoCorrect={false}
          importantForAutofill="yes"
          autoComplete="password"
          textContentType={formMode === "register" ? "newPassword" : "password"}
          secureTextEntry={true}
          onSubmitEditing={onSubmitForm}
          returnKeyLabel={buttonTitle}
          returnKeyType="done"
          autoFocus
        />
        <Spacer units={6} />
        <View style={{ position: "relative" }}>
          <Button
            color={styles.colors.white}
            accentColor={colorPalette.accentColor}
            iconName={IconName.ArrowRight}
            title={buttonTitle}
            onPress={onSubmitForm}
          />
          <View style={formStyles.indicatorContainer}>
            <ActivityIndicator
              animating={isPendingServerResponse}
              color={colorPalette.accentColor}
            />
          </View>
        </View>
        {formMode === "register" && (
          <Text
            style={[
              styles.type.labelTiny.layoutStyle,
              {
                marginTop: styles.layout.gridUnit * 2,
                color: colorPalette.secondaryTextColor,
              },
            ]}
          >
            By creating an Orbit account, you confirm that you have read and
            agree to <Link href="/terms">Orbit’s Terms of Service</Link>.
          </Text>
        )}
      </>
    );
  }

  return (
    <View style={formStyles.container}>
      <View style={{ flex: 1 }} />
      <Logo units={3} tintColor={colorPalette.secondaryTextColor} />
      <Spacer units={8} />
      <Text style={styles.type.headline.layoutStyle}>Sign in</Text>
      <Spacer units={4} />
      <Text style={formStyles.label}>Email address</Text>
      <Spacer units={1} />
      {formContentsNode}
      <View style={{ flex: 1 }} />
    </View>
  );
}

const formStyles = StyleSheet.create({
  container: {
    padding: styles.layout.edgeMargin,
    width: "100%",
    maxWidth: 375,
    flex: 1,
  },

  textInput: {
    marginLeft: -textFieldHorizontalPadding,
    marginRight: -textFieldHorizontalPadding,
  },

  label: {
    ...styles.type.labelSmall.layoutStyle,
    color: styles.colors.white,
  },

  indicatorContainer: {
    position: "absolute",
    right: 0,
    bottom: styles.layout.gridUnit * 2,
  },

  loginInstructionsLabel: {
    ...styles.type.labelSmall.layoutStyle,
    color: styles.colors.ink,
  },
});
