import { styles } from "@withorbit/ui";
import React from "react";
import { Text, View } from "react-native";

export function TestModeBanner(props: {
  colorPalette: styles.colors.ColorPalette;
}) {
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
        TEST MODE: Actions will not be saved.
      </Text>
    </View>
  );
}
