import isEqual from "lodash.isequal";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  getNextRepetitionInterval,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
  PromptType,
} from "metabook-core";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Insets, StyleSheet, View } from "react-native";
import { PromptReviewItem, ReviewItem } from "../reviewItem";
import { colors, layout } from "../styles";
import { ColorPalette } from "../styles/colors";
import unreachableCaseError from "../util/unreachableCaseError";
import Button, { ButtonPendingActivationState } from "./Button";
import Card, { CardProps } from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { IconName } from "./Icon";
import Spacer from "./Spacer";
import Starburst, {
  getStarburstQuillOuterRadius,
  getStarburstRayValueForInterval,
} from "./Starburst";
import StarburstLegend from "./StarburstLegend";

type Size = { width: number; height: number };

export type ReviewAreaMarkingRecord = {
  reviewItem: PromptReviewItem;
  outcome: PromptRepetitionOutcome;
};

export interface ReviewAreaProps {
  items: ReviewItem[];
  currentItemIndex: number;
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  schedule: MetabookSpacedRepetitionSchedule;

  safeInsets?: { top: number; bottom: number };

  // Debug flags
  forceShowAnswer?: boolean;
}

interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
  // status: "hover" | "active";
}

const maximumCardsToRender = 3;
const maximumWidth = 1024;
const maximumHeight = 1024;

type PromptContainerState = "displayed" | "disappearing" | "hidden";

const PromptLayoutContainer = React.memo(function PromptLayoutContainer({
  size,
  displayState,
  onDidDisappear,
  reviewItem,
  backIsRevealed,
}: {
  size: Size;
  displayState: PromptContainerState;
  onDidDisappear: (reviewItem: ReviewItem) => void;
} & CardProps) {
  const rotationUnit = useTransitioningValue({
    value:
      displayState === "disappearing"
        ? -1
        : displayState === "displayed"
        ? 0
        : 1,
    timing: {
      type: "spring",
      useNativeDriver: true,
      bounciness: 0,
      speed: 25,
    },
  });
  const style = [
    StyleSheet.absoluteFill,
    {
      transform: [
        // The translations shift the transform origin to the upper-left corner.
        // TODO: this origin isn't right if the prompts are narrower than the container.
        { translateX: -size.width / 2.0 },
        { translateY: -size.height / 2.0 },
        {
          rotateZ: rotationUnit.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "16deg"],
          }),
        },
        { translateX: size.width / 2.0 },
        { translateY: size.height / 2.0 },
      ],
    },
  ];

  return (
    <FadeView
      isVisible={displayState === "displayed"}
      onTransitionEnd={(toVisible: boolean, didFinish: boolean) => {
        if (!toVisible && didFinish) {
          onDidDisappear(reviewItem);
        }
      }}
      durationMillis={displayState === "displayed" ? 40 : 100}
      delayMillis={displayState === "displayed" ? 60 : 0}
      style={style}
      removeFromLayoutWhenHidden
    >
      {reviewItem && (
        <Card
          reviewItem={reviewItem}
          accentColor={reviewItem.accentColor}
          backIsRevealed={backIsRevealed}
        />
      )}
    </FadeView>
  );
});

const StarburstContainer = React.memo(function StarburstContainer({
  containerSize,
  items,
  currentItemIndex,
  pendingMarkingInteractionState,
  insets,
}: {
  containerSize: Size;
  items: ReviewItem[];
  currentItemIndex: number;
  pendingMarkingInteractionState: PendingMarkingInteractionState | null;
  insets?: Insets;
}) {
  const starburstTopMargin = layout.gridUnit * 6;
  const starburstThickness = 3;

  const widthSizeClass = layout.getWidthSizeClass(containerSize.width);
  const starburstRadius = Math.min(
    widthSizeClass === "regular"
      ? layout.getColumnSpan(1, containerSize.width)
      : // When the starburst goes all the way across, it's too tight on the right side without some extra padding.
        layout.getColumnSpan(2, containerSize.width) - layout.gridUnit,
    containerSize.height - starburstTopMargin,
  );
  const currentItem = items[currentItemIndex];

  const currentItemEffectiveInterval = useMemo(() => {
    const { promptState, prompt } = currentItem;
    if (pendingMarkingInteractionState) {
      return getNextRepetitionInterval({
        schedule: "default",
        currentlyNeedsRetry: promptState?.needsRetry ?? false,
        outcome: pendingMarkingInteractionState.pendingActionOutcome,
        reviewIntervalMillis: promptState
          ? Date.now() - promptState.lastReviewTimestampMillis
          : 0,
        scheduledIntervalMillis: promptState?.intervalMillis ?? null,
        supportsRetry: prompt.promptType !== applicationPromptType, // TODO extract expression, remove duplication with applyActionLogToPromptState
      });
    } else {
      return currentItem.promptState?.intervalMillis ?? 0; // TODO use effective interval relative to review session start time
    }
  }, [currentItem, pendingMarkingInteractionState]);

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
              ? items[currentItemIndex].secondaryColor
              : items[currentItemIndex].shadeColor,
        };
      }),
    [items, currentItemIndex, currentItemEffectiveInterval],
  );

  const starburstOrigin = [
    (insets?.left ?? 0) + layout.edgeMargin + starburstThickness / 2, // We shift by half the thickness so that vertical starburst strokes will align with vertical type strokes at the left edge.
    // We position the bottom of the 3:00 ray at the bottom of a grid row, so that we can lay out other elements in even grid unit multiple from there.
    starburstTopMargin - starburstThickness / 2 + (insets?.top ?? 0),
  ] as const;

  return (
    <>
      <View style={StyleSheet.absoluteFill}>
        <Starburst
          diameter={starburstRadius! * 2}
          entries={starburstEntries}
          thickness={starburstThickness}
          origin={starburstOrigin}
          entryAtHorizontal={currentItemIndex}
          accentOverlayColor={currentItem.accentColor}
        />
      </View>
      <View
        style={{
          position: "absolute",
          left: starburstOrigin[0],
          top: starburstOrigin[1] - 3 / 2,
          width: starburstRadius!,
        }}
      >
        <StarburstLegend
          activeInterval={currentItemEffectiveInterval}
          starburstThickness={3}
          starburstRadius={starburstRadius!}
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
    </>
  );
});

export default function ReviewArea({
  items,
  currentItemIndex,
  onMark,
  forceShowAnswer,
  safeInsets,
}: ReviewAreaProps) {
  const [isShowingAnswer, setShowingAnswer] = useState(!!forceShowAnswer);
  const lastCommittedReviewMarkingRef = useRef<ReviewAreaMarkingRecord | null>(
    null,
  );

  const [
    pendingMarkingInteractionState,
    setPendingMarkingInteractionState,
  ] = useState<PendingMarkingInteractionState | null>(null);
  const [phase, setPhase] = useState(0);

  const currentItem = items[currentItemIndex] || null;
  const onMarkingButton = useCallback(
    (outcome: PromptRepetitionOutcome) => {
      if (currentItem && currentItem.reviewItemType === "prompt") {
        const markingRecord = { reviewItem: currentItem, outcome };
        lastCommittedReviewMarkingRef.current = markingRecord;
        onMark(markingRecord);
      } else {
        throw new Error(`Marked invalid item: ${currentItem}`);
      }
    },
    [currentItem, onMark],
  );

  const onReveal = useCallback(() => {
    if (
      !isShowingAnswer &&
      currentItem &&
      currentItem.reviewItemType === "prompt"
    ) {
      setShowingAnswer(true);
      // TODO: scroll into view if necessary
    }
  }, [isShowingAnswer, currentItem]);

  const departingPromptItems = useRef<ReviewItem[]>([]);

  const onPromptDidDisappear = useCallback((item) => {
    const itemIndex = departingPromptItems.current.indexOf(item);
    if (itemIndex === -1) {
      throw new Error("Unknown prompt disappeared");
    }
    departingPromptItems.current.splice(itemIndex, 1);
    setPhase((phase) => phase + 1);
  }, []);

  const previousItems = usePrevious(items);
  const previousItemIndex = usePrevious(currentItemIndex);
  if (
    previousItems &&
    previousItems.length === items.length &&
    previousItemIndex !== undefined &&
    previousItemIndex !== currentItemIndex
  ) {
    const previousItem = previousItems[previousItemIndex];
    if (
      departingPromptItems.current.length === 0 ||
      !isEqual(departingPromptItems.current[0], previousItem)
    ) {
      departingPromptItems.current.push(previousItem);
      lastCommittedReviewMarkingRef.current = null;
    }
    if (currentItem !== previousItem && isShowingAnswer) {
      setShowingAnswer(false);
      setPendingMarkingInteractionState(null);
    }
  }

  const [size, setSize] = useState<Size | null>(null);

  const renderedItems = departingPromptItems.current
    .concat(items.slice(currentItemIndex))
    .slice(0, maximumCardsToRender);

  const centeringHorizontalInset = size
    ? Math.max(0, (size.width - maximumWidth) / 2.0)
    : 0;
  const centeringVerticalInset = size
    ? Math.max(0, (size.height - maximumHeight) / 2.0)
    : 0;
  const effectiveInsets = {
    top: (safeInsets?.top ?? 0) + centeringVerticalInset,
    bottom: (safeInsets?.bottom ?? 0) + centeringVerticalInset,
    left: centeringHorizontalInset,
    right: centeringHorizontalInset,
  };

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingTop: effectiveInsets.top,
          paddingBottom:
            !safeInsets || effectiveInsets.bottom > safeInsets?.bottom
              ? effectiveInsets.bottom
              : 0, // When the provided safe insets are the only insets we're using, the button bar consumes those safe insets in its internal padding.
          paddingLeft: effectiveInsets.left,
          paddingRight: effectiveInsets.right,
        },
      ]}
      onLayout={({
        nativeEvent: {
          layout: { width, height },
        },
      }) => setSize({ width, height })}
    >
      {size && (
        <>
          <StarburstContainer
            containerSize={{
              width: Math.min(size.width, maximumWidth),
              height: Math.min(size.height, maximumHeight),
            }}
            items={items}
            currentItemIndex={currentItemIndex}
            pendingMarkingInteractionState={pendingMarkingInteractionState}
            insets={effectiveInsets}
          />
          <View style={styles.promptContainer}>
            {Array.from(new Array(maximumCardsToRender).keys()).map(
              (renderNodeIndex) => {
                const renderedItemIndex =
                  (((renderNodeIndex - phase) % maximumCardsToRender) +
                    maximumCardsToRender) %
                  maximumCardsToRender;
                // The rendered stack index is 0 for the prompt that's currently on top, 1 for the prompt card down, -1 for the prompt that's currently animating out.
                const renderedStackIndex =
                  renderedItemIndex - departingPromptItems.current.length;
                const displayState =
                  renderedStackIndex < 0
                    ? "disappearing"
                    : renderedStackIndex === 0
                    ? "displayed"
                    : "hidden";

                return (
                  <PromptLayoutContainer
                    key={renderNodeIndex}
                    displayState={displayState}
                    reviewItem={renderedItems[renderedItemIndex] || null}
                    onDidDisappear={onPromptDidDisappear}
                    size={size}
                    backIsRevealed={
                      (isShowingAnswer && displayState === "displayed") ||
                      displayState === "disappearing"
                    }
                  />
                );
              },
            )}
          </View>

          <ReviewButtonArea
            colorPalette={currentItem /*todo*/}
            onMark={onMarkingButton}
            onReveal={onReveal}
            onPendingMarkingInteractionStateDidChange={
              setPendingMarkingInteractionState
            }
            disabled={currentItemIndex >= items.length}
            promptType={
              currentItem?.reviewItemType === "prompt"
                ? currentItem.prompt.promptType
                : null
            }
            accentColor={currentItem.accentColor}
            isShowingAnswer={isShowingAnswer}
            containerWidth={size.width}
            insetBottom={
              safeInsets && effectiveInsets.bottom === safeInsets.bottom
                ? safeInsets.bottom
                : 0
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },

  // Note: coupled with getHeightForReviewAreaOfWidth.
  promptContainer: {
    marginTop: layout.gridUnit * 9, // margin for starburst
    marginBottom: layout.gridUnit * 2,
    marginLeft: layout.edgeMargin,
    marginRight: layout.edgeMargin,
    maxWidth: 500,
    flex: 1,
  },

  buttonContainer: {
    minHeight: layout.gridUnit * 5,
  },

  compactButtonContainer: {
    marginLeft: layout.edgeMargin,
    marginRight: layout.edgeMargin,
  },
});

function getButtonTitle(
  promptType: PromptType | null,
  outcome: PromptRepetitionOutcome,
) {
  switch (outcome) {
    case PromptRepetitionOutcome.Remembered:
      switch (promptType) {
        case basicPromptType:
        case clozePromptType:
        case null:
          return "Remembered";
        case applicationPromptType:
          return "Answered";
      }
      throw unreachableCaseError(promptType);
    case PromptRepetitionOutcome.Forgotten:
      switch (promptType) {
        case basicPromptType:
        case clozePromptType:
        case null:
          return "Forgotten";
        case applicationPromptType:
          return "Missed";
      }
  }
}

const firstButtonSlop = {
  top: layout.gridUnit * 4,
  left: layout.gridUnit * 2,
  bottom: layout.gridUnit * 4,
  right: 0,
};
const secondButtonSlop = {
  top: layout.gridUnit * 4,
  right: layout.gridUnit * 2,
  bottom: layout.gridUnit * 4,
  left: 0,
};

const ReviewButtonArea = React.memo(function ReviewButtonArea({
  colorPalette,
  disabled,
  onMark,
  onReveal,
  onPendingMarkingInteractionStateDidChange,
  promptType,
  isShowingAnswer,
  containerWidth,
  insetBottom,
}: {
  colorPalette: ColorPalette;
  onMark: (outcome: PromptRepetitionOutcome) => void;
  onReveal: () => void;
  onPendingMarkingInteractionStateDidChange: (
    state: PendingMarkingInteractionState | null,
  ) => void;
  disabled: boolean;
  promptType: PromptType | null;
  accentColor: string;
  isShowingAnswer: boolean;
  containerWidth: number;
  insetBottom?: number;
}) {
  const widthSizeClass = layout.getWidthSizeClass(containerWidth);
  const isVeryNarrow = containerWidth < 340;

  const buttonStyle = {
    flex: 1,
    ...(insetBottom && {
      paddingBottom:
        widthSizeClass === "regular"
          ? // The button already has internal padding when the background is showing. We subtract that off if the safe inset area is larger. This is a bit of a hack, relying on internal knowledge of the button metrics. It might be better to have the button subtract off part of its paddingBottom if necessary.
            Math.max(0, insetBottom - layout.gridUnit * 2)
          : insetBottom,
    }),
    ...(widthSizeClass === "compact" && {
      // Collapse margins of stacked buttons. As with the padding hack above, this relies on internal knowledge of the button metrics. Not ideal.
      marginBottom: layout.gridUnit * 2,
    }),
  };

  const sharedButtonProps = {
    disabled,
    color: colors.white,
    accentColor: colorPalette.accentColor,
    style: buttonStyle,
    backgroundColor:
      widthSizeClass === "regular" ? colorPalette.shadeColor : undefined,
  } as const;

  const forgottenButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );
  const rememberedButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );
  function dispatchPendingMarkingInteraction() {
    const pendingActionOutcome =
      forgottenButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Forgotten
        : rememberedButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Remembered
        : null;
    onPendingMarkingInteractionStateDidChange(
      pendingActionOutcome ? { pendingActionOutcome } : null,
    );
  }

  const spacer = <Spacer units={widthSizeClass === "regular" ? 0.5 : 1} />;
  return (
    <View
      style={[
        styles.buttonContainer,
        widthSizeClass === "compact" && styles.compactButtonContainer,
        {
          flexDirection: isVeryNarrow ? "column" : "row",
          flexWrap: isVeryNarrow ? "wrap" : "nowrap",
        },
      ]}
    >
      {disabled ? null : isShowingAnswer ? (
        <>
          <Button
            {...sharedButtonProps}
            onPress={() => onMark(PromptRepetitionOutcome.Forgotten)}
            iconName={IconName.Cross}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Forgotten,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              forgottenButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={firstButtonSlop}
          />
          {spacer}
          <Button
            {...sharedButtonProps}
            onPress={() => onMark(PromptRepetitionOutcome.Remembered)}
            iconName={IconName.Check}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Remembered,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              rememberedButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={secondButtonSlop}
          />
        </>
      ) : (
        <>
          <View style={{ flex: 1 }} />
          {spacer}
          <Button
            {...sharedButtonProps}
            onPress={onReveal}
            iconName={IconName.Reveal}
            title={"Show answer"}
            hitSlop={secondButtonSlop}
          />
        </>
      )}
    </View>
  );
});
