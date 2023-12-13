import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, layout, type } from "../styles/index.js";
import Button from "./Button.jsx";
import { IconName } from "./IconShared.js";
import Logo from "./Logo.jsx";
import Spacer from "./Spacer.jsx";

export interface ContinueWithUserProps {
  colorPalette: colors.ColorPalette;
  email: string;
  onContinueWithUser: () => void;
}

export default function ContinueWithUser({
  colorPalette,
  email,
  onContinueWithUser,
}: ContinueWithUserProps) {
  const flexibleSpacer = <View style={{ flex: 1 }} />;
  // TODO should probably add an affordance to sign out!
  return (
    <View style={styles.container}>
      {flexibleSpacer}
      <Logo units={3} tintColor={colorPalette.secondaryTextColor} />
      <Spacer units={8} />
      <Text style={styles.label}>Welcome back, {email}.</Text>
      <Spacer units={3} />
      <Text style={[styles.label, { color: colorPalette.secondaryTextColor }]}>
        We signed you in using a saved password.
      </Text>
      <Spacer units={7} />
      <View>
        <Button
          color={colors.white}
          accentColor={colorPalette.accentColor}
          iconName={IconName.ArrowRight}
          title={`Continue`}
          onPress={onContinueWithUser}
          focusOnMount
        />
      </View>
      {flexibleSpacer}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: layout.edgeMargin,
    width: "100%",
    maxWidth: 375,
    flex: 1,
  },
  label: {
    ...type.label.layoutStyle,
    color: colors.ink,
  },
});
