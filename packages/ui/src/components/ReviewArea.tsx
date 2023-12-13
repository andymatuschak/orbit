import { AttachmentID, TaskRepetitionOutcome } from "@withorbit/core";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem.js";
import { colors, layout } from "../styles/index.js";
import { SizeClass } from "../styles/layout.js";
import { Size } from "../util/Size.js";
import Card, { CardProps } from "./Card.jsx";
import FadeView from "./FadeView.jsx";
import useLayout from "./hooks/useLayout.js";
import usePrevious from "./hooks/usePrevious.js";
import { useTransitioningValue } from "./hooks/useTransitioningValue.js";
import ReviewButtonBar from "./ReviewButtonBar.js";

export type ReviewAreaMarkingRecord = {
  reviewAreaItem: ReviewAreaItem;
  outcome: TaskRepetitionOutcome;
};

type PromptContainerState = "displayed" | "disappearing" | "hidden";

const PromptLayoutContainer = React.memo(function PromptLayoutContainer({
  size,
  displayState,
  onDidDisappear,
  reviewItem,
  backIsRevealed,
  getURLForAttachmentID,
}: {
  size: Size;
  displayState: PromptContainerState;
  onDidDisappear: (reviewItem: ReviewAreaItem) => void;
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
          getURLForAttachmentID={getURLForAttachmentID}
          reviewItem={reviewItem}
          accentColor={reviewItem.colorPalette.accentColor}
          backIsRevealed={backIsRevealed}
        />
      )}
    </FadeView>
  );
});

interface PromptStackProps {
  items: ReviewAreaItem[];
  currentItemIndex: number;
  isShowingAnswer: boolean;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;
}

function PromptStack({
  items,
  currentItemIndex,
  isShowingAnswer,
  getURLForAttachmentID,
}: PromptStackProps) {
  const [departedCardCount, setDepartedCardCount] = useState(0);
  const departingPromptItems = useRef<ReviewAreaItem[]>([]);

  const onPromptDidDisappear = useCallback((item: ReviewAreaItem) => {
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
                getURLForAttachmentID={getURLForAttachmentID}
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
  items: ReviewAreaItem[];
  currentItemIndex: number;
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  onPendingOutcomeChange: (
    pendingOutcome: TaskRepetitionOutcome | null,
  ) => void;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;

  sizeClass: SizeClass;
  insetBottom?: number;

  // Debug flags
  forceShowAnswer?: boolean;
}

export default React.memo(function ReviewArea({
  items,
  currentItemIndex,
  onMark,
  forceShowAnswer,
  onPendingOutcomeChange,
  getURLForAttachmentID,
  sizeClass,
  insetBottom = 0,
}: ReviewAreaProps) {
  // console.debug("[Performance - ReviewArea] Render", Date.now() / 1000.0);

  const [isShowingAnswer, setShowingAnswer] = useState(!!forceShowAnswer);

  const previousTaskID = usePrevious(items[currentItemIndex]?.taskID);
  if (previousTaskID && items[currentItemIndex]?.taskID !== previousTaskID) {
    setShowingAnswer(false);
  }

  const handleReveal = useCallback(() => {
    setShowingAnswer(true);
  }, []);

  const currentItem =
    currentItemIndex < items.length ? items[currentItemIndex] : null;

  const handleMark = useCallback(
    (outcome: TaskRepetitionOutcome) => {
      if (!currentItem) {
        throw new Error("Marking without a topmost item");
      }
      onMark({ reviewAreaItem: currentItem, outcome });
    },
    [currentItem, onMark],
  );

  const currentColorPalette =
    items.length > 0
      ? currentItem?.colorPalette ?? items[items.length - 1].colorPalette
      : colors.palettes.red;

  return (
    <View style={{ flex: 1 }}>
      <PromptStack
        getURLForAttachmentID={getURLForAttachmentID}
        currentItemIndex={currentItemIndex}
        isShowingAnswer={isShowingAnswer}
        items={items}
      />
      {currentItem && (
        <ReviewButtonBar
          colorPalette={currentColorPalette}
          sizeClass={sizeClass}
          onMark={handleMark}
          onReveal={handleReveal}
          onPendingOutcomeChange={onPendingOutcomeChange}
          promptType={currentItem.spec.content.type}
          isShowingAnswer={isShowingAnswer}
          insetBottom={insetBottom}
        />
      )}
    </View>
  );
});
