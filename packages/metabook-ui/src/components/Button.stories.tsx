import { action } from "@storybook/addon-actions";
import React from "react";
import { colors } from "../styles";
import Button from "./Button";
import { IconName } from "./Icon";
import { View } from "react-native";

export default {
  title: "Button",
  component: Button,
};

export function PlainButton() {
  return (
    <Button
      title="Button"
      onPress={action("Button clicked")}
      accentColor={colors.fg[1]}
    />
  );
}

export function IconButton() {
  return (
    <View style={{ height: 500 }}>
      <Button
        title="Button"
        onPress={action("Button clicked")}
        iconName={IconName.Check}
        accentColor={colors.fg[1]}
      />
    </View>
  );
}
