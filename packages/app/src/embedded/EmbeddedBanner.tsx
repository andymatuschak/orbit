import { Logo, styles, useOrbitLocale } from "@withorbit/ui";
import React from "react";
import { Text, View } from "react-native";
import {
  EmbeddedBannerMessageInputs,
  getEmbeddedBannerMessage,
} from "./localization.js";

export interface EmbeddedBannerProps extends EmbeddedBannerMessageInputs {
  palette: styles.colors.ColorPalette;
}

export default function EmbeddedBanner(props: EmbeddedBannerProps) {
  const { palette } = props;
  const locale = useOrbitLocale();
  return (
    <View
      style={{
        paddingLeft: styles.layout.edgeMargin,
        paddingRight: styles.layout.edgeMargin,
        flexDirection: "row",
        alignItems: "center",
        height: styles.layout.gridUnit * 6,
        zIndex: 1,
      }}
    >
      <Text
        style={[
          styles.type.label.layoutStyle,
          { color: styles.colors.white, flexGrow: 1 },
        ]}
      >
        {getEmbeddedBannerMessage(locale, props)}
      </Text>
      <a href="https://withorbit.com" target="_blank" rel="noreferrer">
        <Logo units={2} tintColor={palette.secondaryTextColor} />
      </a>
    </View>
  );
}
