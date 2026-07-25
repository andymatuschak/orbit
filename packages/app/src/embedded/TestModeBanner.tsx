import { styles, useOrbitLocale } from "@withorbit/ui";
import React from "react";
import { Text, View } from "react-native";
import { getEmbeddedStrings } from "./localization.js";

export function TestModeBanner(props: {
  colorPalette: styles.colors.ColorPalette;
}) {
  const copy = getEmbeddedStrings(useOrbitLocale());
  /* HACK HACK HACK */
  return (
    <View
      style={[
        {
          position: "absolute",
          left: styles.layout.edgeMargin,
          right: styles.layout.edgeMargin,
          bottom: styles.layout.gridUnit * 10,
          height: "auto",
        },
      ]}
    >
      <Text
        style={[
          styles.type.labelSmall.layoutStyle,
          { color: props.colorPalette.secondaryTextColor },
        ]}
      >
        {copy.testMode}
      </Text>
    </View>
  );
}
