import {
  applicationPromptType,
  getNextRepetitionInterval,
  PromptRepetitionOutcome,
} from "metabook-core";
import React, { useMemo } from "react";
import { View } from "react-native";
import { ReviewItem } from "../reviewItem";
import { colors, layout } from "../styles";
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
}: {
  containerWidth: number;
  containerHeight: number;
  items: ReviewItem[];
  currentItemIndex: number;
  pendingOutcome: PromptRepetitionOutcome | null;
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
  const currentItem = items[currentItemIndex];

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
              ? items[currentItemIndex].secondaryAccentColor
              : items[currentItemIndex].secondaryBackgroundColor,
        };
      }),
    [items, currentItemIndex, currentItemEffectiveInterval],
  );

  const starburstY = starburstTopMargin - starburstThickness / 2;

  return (
    <View style={{ position: "relative", height: layout.gridUnit * 9 }}>
      <View
        style={{
          position: "absolute",
          left: -starburstRadius + layout.edgeMargin + starburstThickness / 2,
          top: -starburstRadius + starburstY,
        }}
      >
        <Starburst
          diameter={starburstRadius * 2}
          entries={starburstEntries}
          thickness={starburstThickness}
          entryAtHorizontal={currentItemIndex}
          accentOverlayColor={currentItem.accentColor}
        />
      </View>
      <View
        style={{
          position: "absolute",
          top: starburstY - starburstThickness / 2,
          width: starburstRadius,
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
          backgroundColor={currentItem.backgroundColor}
        />
      </View>
    </View>
  );
});
export default ReviewStarburst;
