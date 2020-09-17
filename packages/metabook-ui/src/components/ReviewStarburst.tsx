import {
  applicationPromptType,
  getNextRepetitionInterval,
  PromptRepetitionOutcome,
} from "metabook-core";
import React, { useMemo } from "react";
import { Animated, Easing, View } from "react-native";
import { getColorPaletteForReviewItem, ReviewItem } from "../reviewItem";
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
  items,
  currentItemIndex,
  pendingOutcome,
  position,
  showLegend,
  colorMode,
  overrideColorPalette,
}: {
  containerWidth: number;
  containerHeight: number;
  items: ReviewItem[];
  currentItemIndex: number;
  pendingOutcome: PromptRepetitionOutcome | null;
  position: "left" | "center";
  showLegend: boolean;
  colorMode: "accent" | "bicolor";
  overrideColorPalette?: colors.ColorPalette;
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
  const currentItem =
    currentItemIndex < items.length ? items[currentItemIndex] : null;
  if (!currentItem) {
    throw new Error(
      `Starburst displaying index ${currentItemIndex} when only ${items.length} are available`,
    );
  }

  const currentItemEffectiveInterval = useMemo(() => {
    const { promptState, prompt } = currentItem;
    if (pendingOutcome) {
      return getNextRepetitionInterval({
        schedule: "default",
        currentlyNeedsRetry: promptState?.needsRetry ?? false,
        outcome: pendingOutcome,
        reviewIntervalMillis: promptState
          ? Date.now() - promptState.lastReviewTimestampMillis
          : 0,
        scheduledIntervalMillis: promptState?.intervalMillis ?? null,
        supportsRetry: prompt.promptType !== applicationPromptType, // TODO extract expression, remove duplication with applyActionLogToPromptState
      });
    } else {
      return currentItem.promptState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time
    }
  }, [currentItem, pendingOutcome]);

  const currentColorPalette =
    overrideColorPalette ?? getColorPaletteForReviewItem(currentItem);
  const starburstEntries = useMemo(
    () =>
      items.map((item, index) => {
        const effectiveInterval = item.promptState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time
        return {
          value: item.promptState
            ? getStarburstRayValueForInterval(
                index === currentItemIndex
                  ? currentItemEffectiveInterval
                  : effectiveInterval,
              )
            : 0,
          // TODO: implement more proper "is finished" color determination
          color:
            index < currentItemIndex
              ? colorMode === "bicolor"
                ? currentColorPalette.secondaryAccentColor
                : currentColorPalette.accentColor
              : currentColorPalette.secondaryBackgroundColor,
        };
      }),
    [
      items,
      currentItemIndex,
      currentItemEffectiveInterval,
      colorMode,
      currentColorPalette,
    ],
  );

  const starburstX = useTransitioningValue({
    value:
      position === "left"
        ? -starburstRadius + layout.edgeMargin + starburstThickness / 2
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
          accentOverlayColor={currentColorPalette.accentColor}
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
          width: starburstRadius,
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
          futureLabelColor={colors.ink}
          futureTickColor={colors.ink}
          backgroundColor={currentColorPalette.backgroundColor}
        />
      </Animated.View>
    </View>
  );
});
export default ReviewStarburst;
