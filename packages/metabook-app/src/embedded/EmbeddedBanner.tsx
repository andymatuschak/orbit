import { styles } from "metabook-ui";
import React from "react";
import { Text, View } from "react-native";

interface EmbeddedBannerMessageInputs {
  isSignedIn: boolean;
  completePromptCount: number;
  totalPromptCount: number;
}

export interface EmbeddedBannerProps extends EmbeddedBannerMessageInputs {
  palette: styles.colors.ColorPalette;
}

function getBannerMessage({
  isSignedIn,
  completePromptCount,
  totalPromptCount,
}: EmbeddedBannerMessageInputs): string {
  if (!isSignedIn && completePromptCount === 0) {
    return "Quickly review what you just read";
  } else {
    if (completePromptCount < totalPromptCount) {
      return `Review: ${totalPromptCount - completePromptCount} prompts left`;
    } else {
      return `Review complete`;
    }
  }
}

export default function EmbeddedBanner(props: EmbeddedBannerProps) {
  const { palette } = props;
  return (
    <View
      style={{
        paddingTop: styles.layout.gridUnit * 2,
        paddingBottom: styles.layout.gridUnit * 2,
        paddingLeft: styles.layout.gridUnit * 2,
        backgroundColor: palette.shadeColor,
      }}
    >
      <Text
        style={[styles.type.label.layoutStyle, { color: palette.accentColor }]}
      >
        {getBannerMessage(props)}
      </Text>
    </View>
  );
}
