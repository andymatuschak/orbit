import {
  getNextRepetitionInterval,
  PromptRepetitionOutcome,
  PromptState,
} from "metabook-core";
import React, { useMemo } from "react";
import { Animated, Easing, View } from "react-native";
import { colors, layout } from "../styles";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import Starburst, {
  getStarburstQuillOuterRadius,
  getStarburstRayValueForInterval,
} from "./Starburst";
import StarburstLegend from "./StarburstLegend";

export interface ReviewStarburstProps {
  containerWidth: number;
  containerHeight: number;
  items: ReviewStarburstItem[];
  currentItemIndex: number;
  currentItemSupportsRetry: boolean;
  pendingOutcome: PromptRepetitionOutcome | null;
  position: "left" | "center";
  showLegend: boolean;
  colorMode: "accent" | "bicolor";
  colorPalette: colors.ColorPalette;
}

export interface ReviewStarburstItem {
  promptState: PromptState | null;
  isPendingForSession: boolean; // true when item is not yet "done" for the current session
  supportsRetry: boolean;
}

const ReviewStarburst = React.memo(function ReviewStarburst({
  containerWidth,
  containerHeight,
  items,
  currentItemIndex,
  pendingOutcome,
  position,
  showLegend,
  colorMode,
  colorPalette,
}: ReviewStarburstProps) {
  const starburstTopMargin = layout.gridUnit * 4;
  const starburstThickness = 3;

  const widthSizeClass = layout.getWidthSizeClass(containerWidth);
  const starburstRadius = Math.min(
    widthSizeClass === "regular"
      ? layout.getColumnSpan(1, containerWidth)
      : // When the starburst goes all the way across, it's too tight on the right side without some extra padding.
        layout.getColumnSpan(2, containerWidth) - layout.gridUnit,
    containerHeight - starburstTopMargin,
  );

  if (currentItemIndex >= items.length) {
    throw new Error(
      `Starburst displaying index ${currentItemIndex} when only ${items.length} are available`,
    );
  }
  const currentItem =
    currentItemIndex < items.length ? items[currentItemIndex] : null;
  const currentPromptState = currentItem?.promptState;

  const currentItemEffectiveInterval = useMemo(() => {
    if (currentItem && pendingOutcome) {
      return getNextRepetitionInterval({
        schedule: "default",
        currentlyNeedsRetry: currentPromptState?.needsRetry ?? false,
        outcome: pendingOutcome,
        reviewIntervalMillis: currentPromptState
          ? Date.now() - currentPromptState.lastReviewTimestampMillis
          : 0,
        scheduledIntervalMillis: currentPromptState?.intervalMillis ?? null,
        supportsRetry: currentItem?.supportsRetry,
      });
    } else {
      return currentPromptState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
    }
  }, [currentItem, currentPromptState, pendingOutcome]);

  const starburstEntries = useMemo(
    () =>
      items.map((item, index) => {
        const effectiveInterval = item.promptState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
        let color: string;
        // In the review session: prompts are due or needs retry
        // In the embedded context: no prompt state or needs retry
        if (item.isPendingForSession) {
          color = colorPalette.secondaryBackgroundColor;
        } else {
          color =
            colorMode === "bicolor"
              ? colorPalette.secondaryAccentColor
              : colorPalette.accentColor;
        }
        return {
          value: getStarburstRayValueForInterval(
            index === currentItemIndex
              ? currentItemEffectiveInterval
              : effectiveInterval,
          ),
          color,
        };
      }),
    [
      items,
      currentItemIndex,
      currentItemEffectiveInterval,
      colorMode,
      colorPalette,
    ],
  );

  const leftMargin = layout.edgeMargin + starburstThickness / 2;
  const starburstX = useTransitioningValue({
    value:
      position === "left"
        ? -starburstRadius + leftMargin
        : containerWidth / 2 - starburstRadius,
    timing: {
      useNativeDriver: true,
      type: "spring",
      bounciness: 0,
      speed: 6,
    },
  });
  const starburstY = starburstTopMargin - starburstThickness / 2;
  const legendOpacity = useTransitioningValue({
    value: showLegend ? 1 : 0,
    timing: {
      useNativeDriver: true,
      type: "timing",
      duration: 50,
      easing: Easing.linear,
    },
  });

  return (
    <View
      style={{
        position: "relative",
        height: layout.gridUnit * 9,
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: -starburstRadius + starburstY,
          transform: [{ translateX: starburstX }],
        }}
      >
        <Starburst
          diameter={starburstRadius * 2}
          entries={starburstEntries}
          thickness={starburstThickness}
          entryAtHorizontal={currentItemIndex}
          accentOverlayColor={colorPalette.accentColor}
        />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          top: starburstY - starburstThickness / 2,
          transform: [
            {
              translateX: Animated.add(
                starburstX,
                new Animated.Value(starburstRadius),
              ),
            },
          ],
          width: containerWidth - leftMargin,
          opacity: legendOpacity,
        }}
      >
        <StarburstLegend
          activeInterval={currentItemEffectiveInterval}
          starburstThickness={3}
          starburstRadius={starburstRadius}
          starburstQuillOuterRadius={getStarburstQuillOuterRadius(
            starburstEntries.length,
            3,
          )}
          pastLabelColor={colors.white}
          presentLabelColor={colors.white}
          futureLabelColor={colorPalette.secondaryTextColor}
          futureTickColor={colorPalette.secondaryTextColor}
          backgroundColor={colorPalette.backgroundColor}
        />
      </Animated.View>
    </View>
  );
});
export default ReviewStarburst;
