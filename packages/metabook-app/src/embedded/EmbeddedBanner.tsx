import { Logo, styles } from "metabook-ui";
import React from "react";
import { Text, View } from "react-native";

interface EmbeddedBannerMessageInputs {
  isSignedIn: boolean;
  completePromptCount: number;
  totalPromptCount: number;
  sizeClass: styles.layout.SizeClass;
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
    return "Quickly review what you just read.";
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
        paddingLeft: styles.layout.gridUnit * 2,
        paddingRight: styles.layout.gridUnit, // The logo asset includes 1 grid unit of padding.
        flexDirection: "row",
        alignItems: "center",
        height: styles.layout.gridUnit * 6,
        backgroundColor: palette.shadeColor,
      }}
    >
      <Text
        style={[
          styles.type.label.layoutStyle,
          { color: palette.accentColor, flexGrow: 1 },
        ]}
      >
        {getBannerMessage(props)}
      </Text>
      <Logo size={16} style={{ tintColor: styles.colors.white }} />
    </View>
  );
}
