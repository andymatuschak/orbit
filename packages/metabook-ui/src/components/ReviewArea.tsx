import { PromptRepetitionOutcome } from "metabook-core";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { PromptReviewItem, ReviewItem } from "../reviewItem";
import { layout } from "../styles";
import { Size } from "../util/Size";
import Card, { CardProps } from "./Card";
import FadeView from "./FadeView";
import useLayout from "./hooks/useLayout";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import ReviewButtonBar from "./ReviewButtonBar";

export type ReviewAreaMarkingRecord = {
  reviewItem: PromptReviewItem;
  outcome: PromptRepetitionOutcome;
};

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

interface PromptStackProps {
  items: ReviewItem[];
  currentItemIndex: number;
  isShowingAnswer: boolean;
}

function PromptStack({
  items,
  currentItemIndex,
  isShowingAnswer,
}: PromptStackProps) {
  const [departedCardCount, setDepartedCardCount] = useState(0);
  const departingPromptItems = useRef<ReviewItem[]>([]);

  const onPromptDidDisappear = useCallback((item) => {
    const itemIndex = departingPromptItems.current.indexOf(item);
    if (itemIndex === -1) {
      throw new Error("Unknown prompt disappeared");
    }
    departingPromptItems.current.splice(itemIndex, 1);
    setDepartedCardCount((count) => count + 1);
  }, []);

  const previousItems = usePrevious(items);
  const previousItemIndex = usePrevious(currentItemIndex);
  if (
    previousItems !== undefined &&
    previousItemIndex !== undefined &&
    previousItemIndex !== currentItemIndex &&
    departingPromptItems.current.indexOf(previousItems[previousItemIndex]) ===
      -1
  ) {
    departingPromptItems.current.push(previousItems[previousItemIndex]);
  }

  const maximumCardsToRender = 3;
  const renderedItems = departingPromptItems.current
    .concat(items.slice(currentItemIndex))
    .slice(0, maximumCardsToRender);

  const { width, height, onLayout } = useLayout();
  const containerSize = useMemo(() => ({ width, height }), [width, height]);

  return (
    <View
      style={{
        marginBottom: layout.gridUnit * 2,
        marginLeft: layout.edgeMargin,
        marginRight: layout.edgeMargin,
        maxWidth: 500,
        flex: 1,
      }}
      onLayout={onLayout}
    >
      {width > 0 &&
        Array.from(new Array(maximumCardsToRender).keys()).map(
          (renderNodeIndex) => {
            const renderedItemIndex =
              (((renderNodeIndex - departedCardCount) % maximumCardsToRender) +
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
                size={containerSize}
                backIsRevealed={
                  (isShowingAnswer && displayState === "displayed") ||
                  displayState === "disappearing"
                }
              />
            );
          },
        )}
    </View>
  );
}

export interface ReviewAreaProps {
  items: ReviewItem[];
  currentItemIndex: number;
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  onPendingOutcomeChange: (
    pendingOutcome: PromptRepetitionOutcome | null,
  ) => void;

  insetBottom?: number;

  // Debug flags
  forceShowAnswer?: boolean;
}

export default function ReviewArea({
  items,
  currentItemIndex,
  onMark,
  forceShowAnswer,
  onPendingOutcomeChange,
  insetBottom = 0,
}: ReviewAreaProps) {
  const [isShowingAnswer, setShowingAnswer] = useState(!!forceShowAnswer);

  const previousItemIndex = usePrevious(currentItemIndex);
  if (
    previousItemIndex !== undefined &&
    currentItemIndex !== previousItemIndex &&
    isShowingAnswer
  ) {
    setShowingAnswer(false);
  }

  const currentItem =
    currentItemIndex < items.length ? items[currentItemIndex] : null;

  return (
    <View style={{ flex: 1 }}>
      <PromptStack
        currentItemIndex={currentItemIndex}
        isShowingAnswer={isShowingAnswer}
        items={items}
      />

      <ReviewButtonBar
        colorPalette={
          currentItem ?? (items.length > 0 ? items[items.length - 1] : null)
        }
        onMark={useCallback(
          (outcome: PromptRepetitionOutcome) => {
            if (!currentItem) {
              throw new Error("Marking without a topmost item");
            }
            const markingRecord = { reviewItem: currentItem, outcome };
            onMark(markingRecord);
          },
          [currentItem, onMark],
        )}
        onReveal={useCallback(() => {
          setShowingAnswer(true);
        }, [])}
        onPendingOutcomeChange={onPendingOutcomeChange}
        promptType={currentItem?.prompt.promptType ?? null}
        isShowingAnswer={isShowingAnswer}
        insetBottom={insetBottom}
      />
    </View>
  );
}
