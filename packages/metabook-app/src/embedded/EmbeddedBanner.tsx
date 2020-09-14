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
  sizeClass,
}: EmbeddedBannerMessageInputs): string {
  if (!isSignedIn && completePromptCount === 0) {
    return sizeClass === "regular"
      ? "Quickly review what you just read"
      : "Quick review";
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
        paddingLeft: styles.layout.edgeMargin,
        paddingRight: styles.layout.edgeMargin,
        flexDirection: "row",
        alignItems: "center",
        height: styles.layout.gridUnit * 6,
        backgroundColor: palette.secondaryBackgroundColor,
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
      <Logo units={2} style={{ tintColor: styles.colors.white }} />
    </View>
  );
}
