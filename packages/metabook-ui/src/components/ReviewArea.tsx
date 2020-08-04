import isEqual from "lodash.isequal";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
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
import Button from "./Button";
import Card, { CardProps } from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { IconName } from "./Icon";

type Size = { width: number; height: number };

export type ReviewAreaMarkingRecord = {
  reviewItem: PromptReviewItem;
  outcome: PromptRepetitionOutcome;
};

export interface ReviewAreaProps {
  items: ReviewItem[];
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  schedule: MetabookSpacedRepetitionSchedule;

  accentColor: string;
  secondaryColor: string;
  tertiaryColor: string;

  // Debug flags
  forceShowAnswer?: boolean;
}

interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
  status: "hover" | "active";
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
  accentColor,
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
    >
      {reviewItem && (
        <Card
          reviewItem={reviewItem}
          onToggleExplanation={onToggleExplanation}
          accentColor={accentColor}
          backIsRevealed={backIsRevealed}
        />
      )}
    </FadeView>
  );
});

export default function ReviewArea(props: ReviewAreaProps) {
  const { items, onMark, forceShowAnswer, accentColor } = props;

  const [isShowingAnswer, setShowingAnswer] = useState(!!forceShowAnswer);
  const lastCommittedReviewMarkingRef = useRef<ReviewAreaMarkingRecord | null>(
    null,
  );

  const [
    pendingMarkingInteractionState,
    setPendingMarkingInteractionState,
  ] = useState<PendingMarkingInteractionState | null>(null);
  const [phase, setPhase] = useState(0);

  const currentItem = items[0] || null;
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
  if (previousItems !== items && previousItems) {
    if (
      isEqual(previousItems[1], items[0]) &&
      previousItems[0] &&
      (departingPromptItems.current.length === 0 ||
        !isEqual(departingPromptItems.current[0], previousItems[0]))
    ) {
      departingPromptItems.current.push(previousItems[0]);
      lastCommittedReviewMarkingRef.current = null;
    }
    if (!isEqual(items[0], previousItems[0]) && isShowingAnswer) {
      setShowingAnswer(false);
    }
  }

  const [size, setSize] = useState<Size | null>(null);
  const width = size?.width;
  const columnLayout = useMemo(
    () => (width ? layout.getColumnLayout(width) : null),
    [width],
  );

  const renderedItems = departingPromptItems.current
    .concat(items)
    .slice(0, maximumCardsToRender);

  return (
    <View
      style={[
        styles.outerContainer,
        {
          paddingLeft: columnLayout?.edgeMargin,
          paddingRight: columnLayout?.edgeMargin,
          paddingBottom: columnLayout?.edgeMargin,
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
                    accentColor={accentColor}
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
            disabled={items.length === 0}
            promptType={
              currentItem?.reviewItemType === "prompt"
                ? currentItem.prompt.promptType
                : null
            }
            accentColor={accentColor}
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
    marginTop: layout.gridUnit * 9, // TODO starburst
    marginBottom: layout.gridUnit * 3,
    flex: 1,
  },

  buttonContainer: {
    minHeight: layout.gridUnit * 5,
    alignItems: "flex-end",
    justifyContent: "flex-end",
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

const buttonColor = colors.white;

const ReviewButtonArea = React.memo(function ReviewButtonArea({
  accentColor,
  disabled,
  onMark,
  onReveal,
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
    color: buttonColor,
    accentColor,
  } as const;

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
