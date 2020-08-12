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
import { ColorValue, StyleSheet, View } from "react-native";
import { PromptReviewItem, ReviewItem } from "../reviewItem";
import { colors, layout } from "../styles";
import { columnMargin, getColumnSpan } from "../styles/layout";
import unreachableCaseError from "../util/unreachableCaseError";
import Button, { ButtonPendingActivationState } from "./Button";
import Card, { CardProps } from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { IconName } from "./Icon";
import Starburst, {
  getStarburstQuillInnerRadius,
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
const promptRotation = "16deg";

const rotationAnimationTiming = {
  type: "spring",
  useNativeDriver: true,
  bounciness: 0,
  speed: 25,
} as const;

type PromptContainerState = "displayed" | "disappearing" | "hidden";

const PromptContainer = React.memo(function PromptContainer({
  size,
  displayState,
  onDidDisappear,
  reviewItem,
  onToggleExplanation,
  backIsRevealed,
}: {
  size: Size;
  displayState: PromptContainerState;
  onDidDisappear: (reviewItem: ReviewItem) => void;
} & CardProps) {
  const onTransitionEnd = useCallback(
    (toVisible: boolean, didFinish: boolean) => {
      if (!toVisible && didFinish) {
        onDidDisappear(reviewItem);
      }
    },
    [onDidDisappear, reviewItem],
  );

  const rotationUnit = useTransitioningValue({
    value:
      displayState === "disappearing"
        ? -1
        : displayState === "displayed"
        ? 0
        : 1,
    timing: rotationAnimationTiming,
  });

  const style = useMemo(
    () => [
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
              outputRange: ["0deg", promptRotation],
            }),
          },
          { translateX: size.width / 2.0 },
          { translateY: size.height / 2.0 },
        ],
      },
    ],
    [size, rotationUnit],
  );

  return (
    <FadeView
      isVisible={displayState === "displayed"}
      onTransitionEnd={onTransitionEnd}
      durationMillis={displayState === "displayed" ? 40 : 100}
      delayMillis={displayState === "displayed" ? 60 : 0}
      style={style}
      removeFromLayoutWhenHidden
    >
      {reviewItem && (
        <Card
          reviewItem={reviewItem}
          onToggleExplanation={onToggleExplanation}
          accentColor={reviewItem.accentColor}
          backIsRevealed={backIsRevealed}
        />
      )}
    </FadeView>
  );
});

const starburstThickness = 3;
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

  const onTogglePromptExplanation = useCallback((isExplanationExpanded) => {
    throw new Error("Unimplemented"); // TODO
  }, []);

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

  const [size, setSize] = useState<Size | null>(null);
  const width = size?.width;
  const columnLayout = useMemo(
    () => (width ? layout.getColumnLayout(width) : null),
    [width],
  );

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
              : items[currentItemIndex].tertiaryColor,
        };
      }),
    [items, currentItemIndex, currentItemEffectiveInterval],
  );

  const renderedItems = departingPromptItems.current
    .concat(items.slice(currentItemIndex))
    .slice(0, maximumCardsToRender);

  const starburstRadius = columnLayout
    ? getColumnSpan(
        Math.min(2, columnLayout.columnCount),
        columnLayout.columnWidth,
      )
    : null;
  const starburstOrigin = useMemo(
    () =>
      columnLayout
        ? ([
            columnLayout!.edgeMargin -
              getStarburstQuillInnerRadius(
                starburstEntries.length,
                starburstThickness,
              ),
            // We position the bottom of the 3:00 ray at the bottom of a grid row, so that we can lay out other elements in even grid unit multiple from there.
            layout.gridUnit * 6 -
              starburstThickness / 2 +
              (safeInsets?.top ?? 0),
          ] as const)
        : null,
    [columnLayout, safeInsets?.top, starburstEntries.length],
  );

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingTop: safeInsets?.top,
          paddingLeft: columnLayout?.edgeMargin,
          paddingRight: columnLayout?.edgeMargin,
          paddingBottom:
            (columnLayout?.edgeMargin ?? 0) + (safeInsets?.bottom ?? 0),
        },
      ]}
      onLayout={useCallback(
        ({
          nativeEvent: {
            layout: { width, height },
          },
        }) => setSize({ width, height }),
        [],
      )}
    >
      {size && (
        <>
          <View style={StyleSheet.absoluteFill}>
            <Starburst
              diameter={starburstRadius! * 2}
              entries={starburstEntries}
              thickness={starburstThickness}
              origin={starburstOrigin!}
              entryAtHorizontal={currentItemIndex}
              accentOverlayColor={currentItem.accentColor}
            />
          </View>
          <View
            style={{
              position: "absolute",
              left: starburstOrigin![0],
              top: starburstOrigin![1] - starburstThickness / 2,
              width: starburstRadius!,
            }}
          >
            <StarburstLegend
              activeInterval={currentItemEffectiveInterval}
              starburstThickness={starburstThickness}
              starburstRadius={starburstRadius!}
              starburstQuillOuterRadius={getStarburstQuillOuterRadius(
                starburstEntries.length,
                starburstThickness,
              )}
              pastLabelColor={colors.white}
              presentLabelColor={colors.white}
              futureLabelColor={colors.ink}
              futureTickColor={colors.ink}
              backgroundColor={currentItem.backgroundColor}
            />
          </View>
          <View
            style={[
              styles.promptContainer,
              columnLayout && {
                maxWidth: getColumnSpan(
                  Math.min(3, columnLayout.columnCount),
                  columnLayout.columnWidth,
                ),
              },
            ]}
          >
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
                  <PromptContainer
                    key={renderNodeIndex}
                    displayState={displayState}
                    reviewItem={renderedItems[renderedItemIndex] || null}
                    onDidDisappear={onPromptDidDisappear}
                    size={size}
                    onToggleExplanation={onTogglePromptExplanation}
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
            columnLayout={columnLayout!}
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

  promptContainer: {
    marginTop: layout.gridUnit * 9, // margin for starburst
    marginBottom: layout.gridUnit * 3,
    flex: 1,
  },

  buttonContainer: {
    minHeight: layout.gridUnit * 5,
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },

  starburstContainer: {
    position: "absolute",
    width: "100%",
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

const ReviewButtonArea = React.memo(function ReviewButtonArea({
  accentColor,
  disabled,
  onMark,
  onReveal,
  onPendingMarkingInteractionStateDidChange,
  promptType,
  isShowingAnswer,
  columnLayout,
}: {
  onMark: (outcome: PromptRepetitionOutcome) => void;
  onReveal: () => void;
  onPendingMarkingInteractionStateDidChange: (
    state: PendingMarkingInteractionState | null,
  ) => void;
  disabled: boolean;
  promptType: PromptType | null;
  accentColor: ColorValue;
  isShowingAnswer: boolean;
  columnLayout: layout.ColumnLayout;
}) {
  const children: React.ReactNode[] = [];
  function addButton(button: React.ReactNode) {
    if (children.length > 0) {
      children.push(
        <View
          key={`spacer-${children.length}`}
          style={{ width: columnMargin, height: layout.gridUnit }}
        />,
      );
    }
    children.push(button);
  }

  const buttonStyle = {
    width: columnLayout.columnWidth,
    ...(columnLayout.columnCount === 1 && {
      marginBottom: layout.gridUnit * 2,
    }),
  };
  const lastButtonStyle = {
    width: columnLayout.columnWidth,
  };

  const sharedButtonProps = {
    disabled,
    color: colors.white,
    accentColor,
  } as const;

  const forgottenButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );
  const rememberedButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );
  const dispatchPendingMarkingInteraction = useCallback(() => {
    const pendingActionOutcome =
      forgottenButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Forgotten
        : rememberedButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Remembered
        : null;
    onPendingMarkingInteractionStateDidChange(
      pendingActionOutcome ? { pendingActionOutcome } : null,
    );
  }, [onPendingMarkingInteractionStateDidChange]);
  const onForgottenButtonPendingActivation = useCallback(
    (pendingActivationState) => {
      forgottenButtonPendingState.current = pendingActivationState;
      dispatchPendingMarkingInteraction();
    },
    [forgottenButtonPendingState, dispatchPendingMarkingInteraction],
  );
  const onRememberedButtonPendingActivation = useCallback(
    (pendingActivationState) => {
      rememberedButtonPendingState.current = pendingActivationState;
      dispatchPendingMarkingInteraction();
    },
    [rememberedButtonPendingState, dispatchPendingMarkingInteraction],
  );

  if (!disabled) {
    if (isShowingAnswer) {
      addButton(
        <Button
          {...sharedButtonProps}
          style={buttonStyle}
          key={1}
          onPress={() => onMark(PromptRepetitionOutcome.Forgotten)}
          iconName={IconName.Cross}
          title={getButtonTitle(promptType, PromptRepetitionOutcome.Forgotten)}
          onPendingInteractionStateDidChange={
            onForgottenButtonPendingActivation
          }
          hitSlop={{
            top: layout.gridUnit * 4,
            left: layout.gridUnit * 2,
            bottom: layout.gridUnit * 4,
            right: 0,
          }}
        />,
      );
      addButton(
        <Button
          {...sharedButtonProps}
          style={lastButtonStyle}
          key={2}
          onPress={() => onMark(PromptRepetitionOutcome.Remembered)}
          iconName={IconName.Check}
          title={getButtonTitle(promptType, PromptRepetitionOutcome.Remembered)}
          onPendingInteractionStateDidChange={
            onRememberedButtonPendingActivation
          }
          hitSlop={{
            top: layout.gridUnit * 4,
            right: layout.gridUnit * 2,
            bottom: layout.gridUnit * 4,
            left: 0,
          }}
        />,
      );
    } else {
      addButton(
        <Button
          {...sharedButtonProps}
          style={lastButtonStyle}
          key={2}
          onPress={onReveal}
          iconName={IconName.Reveal}
          title={"See answer"}
          hitSlop={{
            top: layout.gridUnit * 4,
            right: layout.gridUnit * 2,
            bottom: layout.gridUnit * 4,
            left: layout.gridUnit * 4,
          }}
        />,
      );
    }
  }

  return (
    <View
      style={[
        styles.buttonContainer,
        {
          maxWidth: getColumnSpan(
            Math.min(2, columnLayout.columnCount),
            columnLayout.columnWidth,
          ),
          flexDirection: columnLayout.columnCount > 1 ? "row" : "column",
          flexWrap: columnLayout.columnCount > 1 ? "nowrap" : "wrap",
        },
      ]}
    >
      {children}
    </View>
  );
});
