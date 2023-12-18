import {
  Button,
  IconName,
  Spacer,
  styles,
  textFieldHorizontalPadding,
  TextInput,
} from "@withorbit/ui";
import React from "react";
import { Text, View } from "react-native";

export interface OnboardingModalProps {
  colorPalette: styles.colors.ColorPalette;
  sizeClass: styles.layout.SizeClass;
}

// Obviously not exhaustive, but good enough for this purpose.
const emailRegexp = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function onSubmit(email: string) {
  if (emailRegexp.test(email)) {
    const tokenTarget = "opener"; // As of macOS 13, Safari claims to support broadcast channels in embedded iframes, but messages seem to silently fail?
    // const tokenTarget = supportsLoginTokenBroadcastChannel()
    //   ? "channel"
    //   : "opener";
    window.open(
      `/login?tokenTarget=${tokenTarget}&email=${encodeURIComponent(email)}`,
      "Sign in",
      "width=375,height=500",
    );
  } else {
    alert("Please enter a valid email address.");
  }
}

export default function OnboardingModalWeb({
  colorPalette,
  sizeClass,
}: OnboardingModalProps) {
  const [email, setEmail] = React.useState("");

  const proseStyle =
    sizeClass === "regular"
      ? styles.type.runningText.layoutStyle
      : styles.type.runningTextSmall.layoutStyle;

  return (
    <View
      style={{
        backgroundColor: colorPalette.backgroundColor,
        paddingTop: styles.layout.edgeMargin,
        paddingRight: styles.layout.edgeMargin,
        paddingBottom: styles.layout.gridUnit,
        paddingLeft: styles.layout.edgeMargin,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 450, // TODO should probably be shared with the review area max width
        }}
      >
        <Text
          style={[
            sizeClass === "regular"
              ? styles.type.label.layoutStyle
              : styles.type.label.layoutStyle,
            { color: styles.colors.white },
          ]}
        >
          Sign in to bring these ideas into your&nbsp;Orbit
        </Text>
        <Spacer units={2} />
        <View
          style={{
            marginLeft: -textFieldHorizontalPadding,
            marginRight: -textFieldHorizontalPadding,
            flexDirection: "row",
            flex: 1,
          }}
        >
          <TextInput
            colorPalette={colorPalette}
            placeholder={
              sizeClass === "regular"
                ? "Enter your email address to sign in"
                : "Enter your email address"
            }
            autoCorrect={false}
            importantForAutofill="yes"
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            style={{
              // Text inputs have some odd sizing behavior on web if you don't explicitly specify a width: they fall back to using their `size` attribute, which defaults to 20. react-native-web doesn't give a hook we can use to change the size attribute's value, so here we are.
              width: "100%",
            }}
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={() => {
              onSubmit(email);
            }}
            returnKeyLabel="Sign in"
            returnKeyType="done"
          />
          <Spacer units={1} />
          <Button
            iconName={IconName.ArrowRight}
            backgroundColor={colorPalette.secondaryBackgroundColor}
            color={colorPalette.accentColor}
            accentColor={colorPalette.accentColor}
            accessibilityLabel="Continue"
            onPress={() => {
              onSubmit(email);
            }}
          />
        </View>
        <Spacer units={3} />
        <Text style={proseStyle}>
          We read so much but remember so little. Orbit helps you deeply
          internalize what you read through periodic review.
        </Text>
        <Spacer units={3} />
        <Text style={proseStyle}>
          Sign in to get started or{" "}
          <a
            href="https://withorbit.com"
            rel="noreferrer"
            target="_blank"
            style={{ color: "inherit" }}
          >
            click here to learn more
          </a>
          .
        </Text>
        <Spacer units={2} />
      </View>
    </View>
  );
}
