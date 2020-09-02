import { action } from "@storybook/addon-actions";
import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../styles";
import Button from "./Button";
import { IconName } from "./Icon";
import Spacer from "./Spacer";

export default {
  title: "Button",
  component: Button,
};

const palette = colors.palettes[0];

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fafafa",
    alignItems: "center",
    maxWidth: 500,
  },

  bgContainer: {
    backgroundColor: palette.backgroundColor,
  },

  button: {
    width: 250,
  },
});

export function PlainButton() {
  return (
    <View style={styles.container}>
      <Button
        title="Button"
        onPress={action("Button clicked")}
        accentColor={colors.productKeyColor}
        onPendingInteractionStateDidChange={(isPendingActivation) =>
          action(`Pending activation`)(isPendingActivation)
        }
      />
      <Button
        title="Disabled"
        onPress={action("Button clicked")}
        accentColor={colors.productKeyColor}
        disabled
      />
    </View>
  );
}

export function IconButton() {
  return (
    <View>
      <View style={styles.container}>
        <View>
          <Button
            title="Button"
            onPress={action("Button clicked")}
            iconName={IconName.Check}
            accentColor={colors.productKeyColor}
            style={styles.button}
          />
        </View>
        <View>
          <Button
            title="Disabled"
            onPress={action("Button clicked")}
            iconName={IconName.Check}
            accentColor={colors.productKeyColor}
            style={styles.button}
            disabled
          />
        </View>
      </View>

      <View style={[styles.container, styles.bgContainer]}>
        <View>
          <Button
            title="Button"
            onPress={action("Button clicked")}
            iconName={IconName.Check}
            accentColor={palette.accentColor}
            backgroundColor={palette.shadeColor}
            color={colors.white}
            style={styles.button}
          />
        </View>
        <View>
          <Button
            title="Disabled"
            onPress={action("Button clicked")}
            iconName={IconName.Check}
            accentColor={palette.accentColor}
            backgroundColor={palette.shadeColor}
            color={colors.white}
            style={styles.button}
            disabled
          />
        </View>
      </View>
    </View>
  );
}

export function LinkButton() {
  return (
    <View style={styles.container}>
      <View>
        <Button
          title="Link button"
          href="https://google.com"
          accentColor={colors.productKeyColor}
        />
      </View>
    </View>
  );
}
