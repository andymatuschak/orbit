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

const ReviewStarburst = React.memo(function ReviewStarburst({
  containerWidth,
  containerHeight,
  itemStates,
  currentItemIndex,
  currentItemSupportsRetry,
  pendingOutcome,
  position,
  showLegend,
  colorMode,
  colorPalette,
}: {
  containerWidth: number;
  containerHeight: number;
  itemStates: (PromptState | null)[];
  currentItemIndex: number;
  currentItemSupportsRetry: boolean;
  pendingOutcome: PromptRepetitionOutcome | null;
  position: "left" | "center";
  showLegend: boolean;
  colorMode: "accent" | "bicolor";
  colorPalette: colors.ColorPalette;
}) {
  const starburstTopMargin = layout.gridUnit * 6;
  const starburstThickness = 3;

  const widthSizeClass = layout.getWidthSizeClass(containerWidth);
  const starburstRadius = Math.min(
    widthSizeClass === "regular"
      ? layout.getColumnSpan(1, containerWidth)
      : // When the starburst goes all the way across, it's too tight on the right side without some extra padding.
        layout.getColumnSpan(2, containerWidth) - layout.gridUnit,
    containerHeight - starburstTopMargin,
  );

  if (currentItemIndex >= itemStates.length) {
    throw new Error(
      `Starburst displaying index ${currentItemIndex} when only ${itemStates.length} are available`,
    );
  }
  const currentItemState =
    currentItemIndex < itemStates.length ? itemStates[currentItemIndex] : null;

  const currentItemEffectiveInterval = useMemo(() => {
    if (pendingOutcome) {
      return getNextRepetitionInterval({
        schedule: "default",
        currentlyNeedsRetry: currentItemState?.needsRetry ?? false,
        outcome: pendingOutcome,
        reviewIntervalMillis: currentItemState
          ? Date.now() - currentItemState.lastReviewTimestampMillis
          : 0,
        scheduledIntervalMillis: currentItemState?.intervalMillis ?? null,
        supportsRetry: currentItemSupportsRetry,
      });
    } else {
      return currentItemState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
    }
  }, [currentItemState, currentItemSupportsRetry, pendingOutcome]);

  const starburstEntries = useMemo(
    () =>
      itemStates.map((itemState, index) => {
        const effectiveInterval = itemState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
        let color: string;
        if (itemState) {
          color =
            colorMode === "bicolor"
              ? colorPalette.secondaryAccentColor
              : colorPalette.accentColor;
        } else {
          color = colorPalette.secondaryBackgroundColor;
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
      itemStates,
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
