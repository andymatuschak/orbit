import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, type, layout } from "../styles";
import Button from "./Button";
import { IconName } from "./IconShared";
import Logo from "./Logo";
import Spacer from "./Spacer";

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

  return (
    <View style={styles.container}>
      {flexibleSpacer}
      <Logo units={3} tintColor={colorPalette.secondaryTextColor} />
      <Spacer units={8} />
      <Text style={styles.label}>
        Welcome back, {email}. We signed you in using a saved password.
      </Text>
      <Spacer units={3.5} />
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
    ...type.labelSmall.layoutStyle,
    color: colors.white,
  },
});
