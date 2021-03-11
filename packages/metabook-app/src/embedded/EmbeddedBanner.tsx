import { Logo, styles } from "@withorbit/ui";
import React from "react";
import { Text, View } from "react-native";

interface EmbeddedBannerMessageInputs {
  isSignedIn: boolean;
  completePromptCount: number;
  totalPromptCount: number;
  sizeClass: styles.layout.SizeClass;
  wasInitiallyComplete: boolean;
}

export interface EmbeddedBannerProps extends EmbeddedBannerMessageInputs {
  palette: styles.colors.ColorPalette;
}

function getBannerMessage({
  isSignedIn,
  completePromptCount,
  totalPromptCount,
  sizeClass,
  wasInitiallyComplete,
}: EmbeddedBannerMessageInputs): string {
  function formatPrompts(n: number): string {
    return n === 1 ? "1 prompt" : `${n} prompts`;
  }

  if (!isSignedIn && completePromptCount === 0) {
    return sizeClass === "regular"
      ? "Quickly review what you just read."
      : "Quick review:";
  } else {
    if (completePromptCount >= totalPromptCount || wasInitiallyComplete) {
      return `Review complete`;
    } else if (completePromptCount === 0) {
      return sizeClass === "regular"
        ? `Review session: ${formatPrompts(totalPromptCount)}`
        : `Review: ${formatPrompts(totalPromptCount)}`;
    } else if (completePromptCount < totalPromptCount) {
      return sizeClass === "regular"
        ? `Review session: ${formatPrompts(
            totalPromptCount - completePromptCount,
          )} left`
        : `${formatPrompts(totalPromptCount - completePromptCount)} left`;
    } else {
      throw new Error("Unreachable");
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
        zIndex: 1,
      }}
    >
      <Text
        style={[
          styles.type.label.layoutStyle,
          { color: styles.colors.white, flexGrow: 1 },
        ]}
      >
        {getBannerMessage(props)}
      </Text>
      <a href="https://withorbit.com" target="_blank" rel="noreferrer">
        <Logo units={2} tintColor={palette.secondaryTextColor} />
      </a>
    </View>
  );
}
