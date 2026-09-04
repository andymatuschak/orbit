import {
  createSpacedRepetitionScheduler,
  SpacedRepetitionSchedulerConfiguration,
  TaskComponentState,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import React, { useMemo } from "react";
import { Animated, Easing, View } from "react-native";
import { colors, layout } from "../styles/index.js";
import { useTransitioningValue } from "./hooks/useTransitioningValue.js";
import Starburst, {
  getStarburstQuillOuterRadius,
  getStarburstRayValueForInterval,
} from "./Starburst.jsx";
import StarburstLegend from "./StarburstLegend.js";

export interface ReviewStarburstProps {
  config: SpacedRepetitionSchedulerConfiguration;
  containerWidth: number;
  containerHeight: number;
  items: ReviewStarburstItem[];
  currentItemIndex: number;
  pendingOutcome: TaskRepetitionOutcome | null;
  position: "left" | "center";
  showLegend: boolean;
  colorMode: "accent" | "bicolor";
  colorPalette: colors.ColorPalette;
}

export interface ReviewStarburstItem {
  component: TaskComponentState | null;
  isPendingForSession: boolean; // true when item is not yet "done" for the current session
}

const ReviewStarburst = React.memo(function ReviewStarburst({
  config,
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
  const currentComponent = currentItem?.component;

  const currentItemEffectiveInterval = useMemo(() => {
    const scheduler = createSpacedRepetitionScheduler(config);
    if (currentComponent && pendingOutcome) {
      const nextInterval = scheduler.computeNextDueIntervalMillisForRepetition(
        currentComponent,
        currentComponent?.lastRepetitionTimestampMillis
          ? Date.now() - currentComponent.lastRepetitionTimestampMillis
          : 0,
        pendingOutcome,
      );
      return nextInterval.dueTimestampMillis;
    } else {
      return currentComponent?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
    }
  }, [currentComponent, pendingOutcome, config]);

  const starburstEntries = useMemo(
    () =>
      items.map((item, index) => {
        const effectiveInterval = item.component?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time https://github.com/andymatuschak/metabook/issues/117
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
            config,
          ),
          color,
        };
      }),
    [
      config,
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
        height: layout.gridUnit * 7,
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
          config={config}
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
