import DebugGrid from "metabook-ui/dist/components/DebugGrid";
import Spacer from "metabook-ui/dist/components/Spacer";
import React from "react";
import { Text, View } from "react-native";
import { TextInput, styles } from "metabook-ui";

export interface OnboardingModalProps {
  colorPalette: styles.colors.ColorPalette;
}

export default function OnboardingModalWeb({
  colorPalette,
}: OnboardingModalProps) {
  const proseStyle = styles.type.prose.layoutStyle;

  return (
    <View
      style={{
        backgroundColor: colorPalette.backgroundColor,
        padding: styles.layout.edgeMargin,
        alignItems: "center",
      }}
    >
      <View
        style={{
          maxWidth: 600, // TODO should probably be shared with the review area max width
        }}
      >
        <Text style={styles.type.headline.layoutStyle}>
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
          Set up a free account to get started or learn more.
        </Text>
        <Spacer units={6} />
        <Text
          style={[
            styles.type.bodySmall.layoutStyle,
            { color: styles.colors.white },
          ]}
        >
          Enter your email address to sign up or sign in:
        </Text>
        <Spacer units={1} />
        <View
          style={{
            marginLeft: -TextInput.textFieldHorizontalPadding,
            marginRight: -TextInput.textFieldHorizontalPadding,
          }}
        >
          <TextInput colorPalette={colorPalette} placeholder="you@you.com" />
        </View>
      </View>
    </View>
  );
}
