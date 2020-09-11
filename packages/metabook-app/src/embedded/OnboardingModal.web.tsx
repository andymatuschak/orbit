import { Button, IconName, Spacer, styles, TextInput } from "metabook-ui";
import { SizeClass } from "metabook-ui/dist/styles/layout";
import React from "react";
import { Text, View } from "react-native";

export interface OnboardingModalProps {
  colorPalette: styles.colors.ColorPalette;
  sizeClass: SizeClass;
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
          maxWidth: 550, // TODO should probably be shared with the review area max width
        }}
      >
        <Text
          style={
            sizeClass === "regular"
              ? styles.type.headline.layoutStyle
              : styles.type.label.layoutStyle
          }
        >
          Bring these ideas into your&nbsp;Orbit.
        </Text>
        <Spacer units={3} />
        <Text style={proseStyle}>
          This page uses Orbit, an experimental system which aims to make it
          almost effortless to deeply internalize what you read. (Instead of the
          usual: rapidly forgetting all but the gist.)
        </Text>
        <Spacer units={3} />
        <Text style={proseStyle}>
          Orbit works by keeping you in contact with ideas over time. In a week,
          we’ll invite you to try these prompts again. Then you’ll repeat with
          expanding intervals: two weeks, a month, and so on, building durable
          understanding in a few minutes per session.
        </Text>
        <Spacer units={3} />
        <Text style={proseStyle}>
          Set up a free account to get started or{" "}
          <a
            href="https://withorbit.com"
            rel="noreferrer"
            target="_blank"
            style={{ color: "inherit" }}
          >
            learn more
          </a>
          .
        </Text>
        <Spacer units={5} />
        <Text
          style={[
            sizeClass === "regular"
              ? styles.type.label.layoutStyle
              : styles.type.labelSmall.layoutStyle,
            { color: styles.colors.white },
          ]}
        >
          Enter your email address to sign in:
        </Text>
        <Spacer units={1} />
        <View
          style={{
            marginLeft: -TextInput.textFieldHorizontalPadding,
            marginRight: -TextInput.textFieldHorizontalPadding,
            flexDirection: "row",
            flex: 1,
          }}
        >
          <TextInput
            colorPalette={colorPalette}
            placeholder="you@you.com"
            autoCorrect={false}
            importantForAutofill="yes"
            autoCompleteType="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            style={{ flexGrow: 1 }}
            value={email}
            onChangeText={setEmail}
          />
          <Spacer units={1} />
          <Button
            iconName={IconName.ArrowRight}
            backgroundColor={colorPalette.secondaryBackgroundColor}
            color={colorPalette.accentColor}
            accentColor={colorPalette.accentColor}
            accessibilityLabel="Continue"
            onPress={() => {
              return;
            }}
          />
        </View>
      </View>
    </View>
  );
}
