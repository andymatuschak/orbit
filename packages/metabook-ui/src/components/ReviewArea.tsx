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
import { colors } from "../styles";
import { gridUnit } from "../styles/layout";
import unreachableCaseError from "../util/unreachableCaseError";
import Button from "./Button";
import Card from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { IconName } from "./Icon";
import Spacer from "./Spacer";

type Size = { width: number; height: number };

export type ReviewAreaMarkingRecord = {
  reviewItem: PromptReviewItem;
  outcome: PromptRepetitionOutcome;
};

export interface ReviewAreaProps {
  items: ReviewItem[];
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  schedule: MetabookSpacedRepetitionSchedule;

  // Debug flags
  forceShowAnswer?: boolean;
}

interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
  status: "hover" | "active";
}

const maximumCardsToRender = 3;
const promptRotation = "16deg";

function PromptContainer({
  size,
  renderedStackIndex,
  item,
  onDidDisappear,
  children,
}: {
  size: { width: number; height: number };
  item: PromptReviewItem;
  renderedStackIndex: number;
  onDidDisappear: (renderedStackIndex: number) => void;
  children: React.ReactNode;
}) {
  const isDisplayed = item !== null && renderedStackIndex === 0;

  const onTransitionEnd = useCallback(
    (toVisible: boolean, didFinish: boolean) => {
      if (!toVisible && didFinish) {
        onDidDisappear(renderedStackIndex);
      }
    },
    [onDidDisappear, renderedStackIndex],
  );

  const rotationUnit = useTransitioningValue({
    value: renderedStackIndex < 0 ? -1 : renderedStackIndex === 0 ? 0 : 1,
    timing: {
      type: "spring",
      useNativeDriver: true,
      bounciness: 0,
      speed: 25,
    },
  });

  const style = useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        zIndex: maximumCardsToRender - renderedStackIndex + 1,
        transform: [
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
    [size, renderedStackIndex, rotationUnit],
  );

  return (
    <FadeView
      isVisible={isDisplayed}
      onTransitionEnd={onTransitionEnd}
      durationMillis={renderedStackIndex === 0 ? 40 : 100}
      delayMillis={renderedStackIndex === 0 ? 60 : 0}
      style={style}
    >
      {children}
    </FadeView>
  );
}

export default function ReviewArea(props: ReviewAreaProps) {
  const accentColor = colors.fg[6]; // TODO

  const { items, onMark, forceShowAnswer } = props;

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

  const onTogglePromptExplanation = useCallback(
    (isExplanationExpanded) => {
      if (currentItem?.reviewItemType !== "prompt") {
        throw new Error(
          "How are we toggling the top card's explanation when it's not a question?",
        );
      }

      throw new Error("Unimplemented"); // TODO
    },
    [currentItem],
  );

  const departingPromptItems = useRef<ReviewItem[]>([]);

  const onPromptDidDisappear = useCallback((renderedStackIndex) => {
    departingPromptItems.current.splice(-1 * renderedStackIndex - 1, 1);
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

  const renderedItems = departingPromptItems.current
    .concat(items)
    .slice(0, maximumCardsToRender);

  return (
    <View
      style={styles.outerContainer}
      onLayout={useCallback(
        ({
          nativeEvent: {
            layout: { width, height },
          },
        }) => setSize({ width, height }),
        [],
      )}
    >
      <View style={styles.promptContainer}>
        {size &&
          Array.from(new Array(maximumCardsToRender).keys()).map(
            (renderNodeIndex) => {
              const renderedItemIndex =
                (((renderNodeIndex - phase) % maximumCardsToRender) +
                  maximumCardsToRender) %
                maximumCardsToRender;
              // The rendered stack index is 0 for the prompt that's currently on top, 1 for the prompt card down, -1 for the prompt that's currently animating out.
              const renderedStackIndex =
                renderedItemIndex - departingPromptItems.current.length;

              return (
                <PromptContainer
                  key={renderNodeIndex}
                  renderedStackIndex={renderedStackIndex}
                  item={renderedItems[renderedItemIndex] || null}
                  onDidDisappear={onPromptDidDisappear}
                  size={size}
                >
                  {(renderedItems[renderedItemIndex] || null) && (
                    <Card
                      backIsRevealed={
                        (isShowingAnswer && renderedStackIndex === 0) ||
                        renderedStackIndex < 0
                      }
                      reviewItem={renderedItems[renderedItemIndex] || null}
                      onToggleExplanation={onTogglePromptExplanation}
                      contextColor={accentColor}
                    />
                  )}
                </PromptContainer>
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
        accentColor={colors.fg[6]} // TODO
        isShowingAnswer={isShowingAnswer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
  },

  promptContainer: {
    marginTop: gridUnit * 9, // TODO
    flex: 1,
  },

  buttonContainer: {
    flexDirection: "row",
    height: gridUnit * 5,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    maxWidth: 175 * 2 + gridUnit, // TODO
  },

  buttonLayoutStyles: {
    width: 175, // TODO
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
          return "Didn’t remember";
        case applicationPromptType:
          return "Couldn’t answer";
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
}) {
  const children: React.ReactNode[] = [];
  function addButton(button: React.ReactNode) {
    if (children.length > 0) {
      children.push(<Spacer units={1} />);
    }
    children.push(button);
  }

  const onForgot = useCallback(
    () => onMark(PromptRepetitionOutcome.Forgotten),
    [onMark],
  );

  const onRemembered = useCallback(
    () => onMark(PromptRepetitionOutcome.Remembered),
    [onMark],
  );

  const sharedButtonProps = {
    disabled,
    style: styles.buttonLayoutStyles,
    color: buttonColor,
    accentColor,
  } as const;

  if (!disabled) {
    if (isShowingAnswer) {
      addButton(
        <Button
          {...sharedButtonProps}
          onPress={onForgot}
          iconName={IconName.Cross}
          title={getButtonTitle(promptType, PromptRepetitionOutcome.Forgotten)}
        />,
      );
      addButton(
        <Button
          {...sharedButtonProps}
          onPress={onRemembered}
          iconName={IconName.Check}
          title={getButtonTitle(promptType, PromptRepetitionOutcome.Remembered)}
        />,
      );
    } else {
      addButton(
        <Button
          {...sharedButtonProps}
          onPress={onReveal}
          // iconName={IconName.Cross}
          title={"Reveal answer"}
        />,
      );
    }
  }

  return <View style={styles.buttonContainer}>{children}</View>;
});
