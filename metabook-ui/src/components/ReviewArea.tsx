import isEqual from "lodash.isequal";
import {
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
  PromptType,
} from "metabook-core";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  StyleProp,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";
import { PromptReviewItem, ReviewItem } from "../reviewItem";
import colors from "../styles/colors";
import { gridUnit, spacing } from "../styles/layout";
import Card, { baseCardHeight, cardWidth } from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";
import ReviewButton from "./ReviewButton";
import Spacer from "./Spacer";
import WithAnimatedValue = Animated.WithAnimatedValue;

type InternalReviewItem =
  | ReviewItem
  | {
      reviewItemType: "completedQuestion";
      markingRecord: ReviewAreaMarkingRecord;
    };

export type ReviewAreaMarkingRecord = {
  reviewItem: PromptReviewItem;
  outcome: PromptRepetitionOutcome;
};

export interface ReviewAreaProps {
  items: ReviewItem[];
  onMark: (
    markingRecord: ReviewAreaMarkingRecord,
  ) => //cardHandle: CardHandle, TODO
  void;
  onLogin: () => void;
  schedule: MetabookSpacedRepetitionSchedule;
  shouldLabelApplicationPrompts: boolean;

  showsCompletedState?: boolean;
  showsNeedsRetryNotice?: boolean;

  // Debug flags
  forceShowAnswer?: boolean;
  disableVisibilityTesting?: boolean;
}

interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
  status: "hover" | "active";
}

function getTransformForStackIndex(stackIndex: number) {
  return { scale: 1 - stackIndex * 0.05, translateY: stackIndex * 20 };
}

function getRenderedItemIndexFromRenderNodeIndex(
  renderNodeIndex: number,
  phase: number,
  maximumCardsToRender: number,
) {
  return (
    (((renderNodeIndex - phase) % maximumCardsToRender) +
      maximumCardsToRender) %
    maximumCardsToRender
  );
}

function CardRenderer({
  departingMarkingRecordQueueRef,
  maximumCardsToDisplay,
  renderedStackIndex,
  setPhase,
  item,
  children,
}: {
  item: InternalReviewItem;
  renderedStackIndex: number;
  maximumCardsToDisplay: number;
  departingMarkingRecordQueueRef: React.MutableRefObject<
    ReviewAreaMarkingRecord[]
  >;
  setPhase: (value: ((prevState: number) => number) | number) => void;
  children: React.ReactNode;
}) {
  const { scale, translateY } = getTransformForStackIndex(renderedStackIndex);
  const animatedScale = useTransitioningValue(scale, { type: "spring" });
  const animatedTranslateY = useTransitioningValue(translateY, {
    type: "spring",
  });

  const isDisplayed =
    item !== null &&
    item.reviewItemType !== "completedQuestion" &&
    renderedStackIndex < maximumCardsToDisplay;

  return (
    <FadeView
      isVisible={isDisplayed}
      onTransitionEnd={(toVisible, didFinish) => {
        // TODO this will force rerenders, so extract the container to its own node
        if (!toVisible && didFinish) {
          departingMarkingRecordQueueRef.current.splice(
            -1 * renderedStackIndex - 1,
            1,
          );
          setPhase((phase) => phase + 1);
        }
      }}
      durationMillis={100}
      style={
        StyleSheet.compose<ViewStyle>(styles.cardContainer, ({
          zIndex: maximumCardsToDisplay - renderedStackIndex + 1,
          transform: [
            { scale: animatedScale },
            { translateY: animatedTranslateY },
          ],
        } as unknown) as StyleProp<ViewStyle>) as WithAnimatedValue<
          StyleProp<ViewStyle>
        >
      }
    >
      {children}
    </FadeView>
  );
}

export default function ReviewArea(props: ReviewAreaProps) {
  const {
    items,
    onMark,
    schedule,
    showsCompletedState,
    showsNeedsRetryNotice,
    forceShowAnswer,
    disableVisibilityTesting,
    shouldLabelApplicationPrompts,
  } = props;

  const [isShowingAnswer, setShowingAnswer] = useState(!!forceShowAnswer);
  const lastCommittedReviewMarkingRef = useRef<ReviewAreaMarkingRecord | null>(
    null,
  );
  const previousItems = usePrevious(props.items);

  const [
    pendingMarkingInteractionState,
    setPendingMarkingInteractionState,
  ] = useState<PendingMarkingInteractionState | null>(null);
  const [phase, setPhase] = useState(0);

  // const containerRef = useRef<HTMLDivElement | null>(null);
  /*const { inViewport } = useInViewport(
    containerRef,
    { rootMargin: "200px" },
    { disconnectOnLeave: false },
    {},
  ); TODO */
  const inViewport = true;
  //useScrollBehaviorPolyfill(); TODO

  // const currentCardHandleRef = useRef<CardHandle | null>(null);

  const currentItem = items[0] || null;
  const onMarkingButton = useCallback(
    (outcome: PromptRepetitionOutcome) => {
      if (currentItem && currentItem.reviewItemType === "prompt") {
        const markingRecord = { reviewItem: currentItem, outcome };
        lastCommittedReviewMarkingRef.current = markingRecord;
        onMark(markingRecord /*, currentCardHandleRef.current! TODO */);
      } else {
        throw new Error(`Marked invalid item: ${currentItem}`);
      }
    },
    [currentItem, onMark],
  );

  const onPress = useCallback(() => {
    if (
      !isShowingAnswer &&
      currentItem &&
      currentItem.reviewItemType === "prompt"
    ) {
      setShowingAnswer(true);

      /*const boundingRect = containerRef.current!.getBoundingClientRect();
      if (boundingRect.bottom - 40 > window.innerHeight) {
        if (!isScrollBehaviorPolyfillReady()) {
          console.error("Scroll behavior polyfill still not loaded!");
        }
        window.scrollTo({
          behavior: "smooth",
          top: window.scrollY + (boundingRect.bottom - window.innerHeight) + 45,
          left: 0,
        });
      } TODO */
    }
  }, [isShowingAnswer, currentItem]);

  const onToggleTopCardExplanation = useCallback(
    (isExplanationExpanded) => {
      if (currentItem?.reviewItemType !== "prompt") {
        throw new Error(
          "How are we toggling the top card's explanation when it's not a question?",
        );
      }
      /* TODO context?.onToggleExplanation(
        isExplanationExpanded,
        currentItem.cardData.cardID,
        currentItem.promptIndex,
      ); */
    },
    [currentItem /*, context*/],
  );

  const departingMarkingRecordQueueRef = useRef<ReviewAreaMarkingRecord[]>([]);

  const isComplete = items.length === 0 && !!showsCompletedState;

  const maximumCardsToDisplay = 3;
  const maximumCardsToRender = 5;
  //const maximumCardsToDisplay = window.innerHeight >= 568 ? 3 : 1; // TODO
  //const maximumCardsToRender = window.innerHeight >= 568 ? 5 : 3;

  if (
    lastCommittedReviewMarkingRef.current &&
    !isEqual(previousItems, items) &&
    previousItems &&
    isShowingAnswer
  ) {
    setShowingAnswer(false);
    if (isEqual(previousItems[1], items[0])) {
      departingMarkingRecordQueueRef.current.push(
        lastCommittedReviewMarkingRef.current,
      );
      lastCommittedReviewMarkingRef.current = null;
    }
  }

  const renderedItems = departingMarkingRecordQueueRef.current
    .map(
      (markingRecord) =>
        ({
          reviewItemType: "completedQuestion",
          markingRecord,
        } as InternalReviewItem),
    )
    .concat(items)
    .slice(0, maximumCardsToRender);

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      accessible={false}
      /*className={`ReviewArea ${isComplete ? "ReviewAreaComplete" : ""}
      style={{
        cursor: isComplete || isShowingAnswer ? undefined : "pointer"
      touch-action="manipulation"
      }} TODO*/
    >
      <View style={styles.outerContainer}>
        <Transition in={isComplete} timeout={500} mountOnEnter unmountOnExit>
          <View
          //className="ReviewAreaCompleteSummary" TODO
          //style={{ opacity: isComplete ? 1 : 0 }}
          >
            {/*<div className="ReviewAreaCompleteGlyph" /> TODO */}
            <Text>Review complete</Text>
          </View>
        </Transition>

        <FadeView
          isVisible={!isComplete}
          durationMillis={500}
          style={
            styles.stackContainer
          } /*style={{ opacity: isComplete ? 0 : 1 }} TODO */
        >
          {(inViewport || disableVisibilityTesting) &&
            Array.from(new Array(maximumCardsToRender).keys()).map(
              (renderNodeIndex) => {
                const renderedItemIndex = getRenderedItemIndexFromRenderNodeIndex(
                  renderNodeIndex,
                  phase,
                  maximumCardsToRender,
                );
                const item: InternalReviewItem | null =
                  renderedItems[renderedItemIndex] || null;

                // The rendered stack index is 0 for the card that's currently on top, 1 for the next card down, -1 for the card that's currently animating out.
                const renderedStackIndex =
                  renderedItemIndex -
                  departingMarkingRecordQueueRef.current.length;
                const isRevealed =
                  (isShowingAnswer && renderedStackIndex === 0) ||
                  renderedStackIndex < 0;

                let cardComponent: React.ReactNode;

                if (item === null) {
                  cardComponent = null;
                  /*} TODO else if (item.type === "login") {
                cardComponent = (
                  <div className="Card LoginCard">
                    <Login
                      isActive={renderedStackIndex === 0}
                      onLogin={onLogin}
                      userState={item.userState}
                    />
                  </div>
                ); */
                } else {
                  let reviewItem: PromptReviewItem;
                  let reviewMarkingInteractionState: ReviewMarkingInteractionState | null;

                  if (item.reviewItemType === "prompt") {
                    reviewItem = item;
                    if (
                      lastCommittedReviewMarkingRef.current &&
                      isEqual(
                        lastCommittedReviewMarkingRef.current.reviewItem,
                        reviewItem,
                      )
                    ) {
                      reviewMarkingInteractionState = {
                        status: "committed",
                        outcome: lastCommittedReviewMarkingRef.current.outcome,
                      } as const;
                    } else if (
                      renderedStackIndex === 0 &&
                      pendingMarkingInteractionState !== null &&
                      isShowingAnswer
                    ) {
                      reviewMarkingInteractionState = {
                        status:
                          pendingMarkingInteractionState.status === "hover"
                            ? "pending"
                            : "committed",
                        outcome:
                          pendingMarkingInteractionState.pendingActionOutcome,
                      } as const;
                    } else {
                      reviewMarkingInteractionState = null;
                    }
                  } else {
                    reviewItem = item.markingRecord.reviewItem;
                    reviewMarkingInteractionState = {
                      status: "committed",
                      outcome: item.markingRecord.outcome,
                    };
                  }

                  cardComponent = (
                    <Card
                      isRevealed={isRevealed}
                      isOccluded={renderedStackIndex > 0}
                      reviewItem={reviewItem}
                      reviewMarkingInteractionState={
                        reviewMarkingInteractionState
                      }
                      schedule={schedule}
                      showsNeedsRetryNotice={showsNeedsRetryNotice}
                      // ref={
                      //   renderedStackIndex === 0
                      //     ? currentCardHandleRef
                      //     : undefined
                      // } TODO
                      onToggleExplanation={onToggleTopCardExplanation}
                      shouldLabelApplicationPrompts={
                        shouldLabelApplicationPrompts
                      }
                    />
                  );
                }
                return (
                  <CardRenderer
                    key={renderNodeIndex}
                    renderedStackIndex={renderedStackIndex}
                    item={item}
                    maximumCardsToDisplay={maximumCardsToDisplay}
                    departingMarkingRecordQueueRef={
                      departingMarkingRecordQueueRef
                    }
                    setPhase={setPhase}
                  >
                    {cardComponent}
                  </CardRenderer>
                );
              },
            )}
        </FadeView>

        <Transition in={!isComplete} timeout={500} mountOnEnter unmountOnExit>
          <View style={{ opacity: isComplete ? 0 : 1, alignItems: "center" }}>
            <ReviewButtonArea
              onMark={onMarkingButton}
              onPendingMarkingInteractionStateDidChange={
                setPendingMarkingInteractionState
              }
              disabled={!isShowingAnswer || items.length === 0}
              promptType={
                currentItem?.reviewItemType === "prompt"
                  ? currentItem.prompt.promptType
                  : null
              }
            />
          </View>
        </Transition>
      </View>
    </TouchableWithoutFeedback>
  );
}

function Transition(props: {
  in: boolean;
  children: React.ReactNode;
  onExited?: any;
  timeout: number;
  mountOnEnter?: boolean;
  unmountOnExit?: boolean;
}) {
  return <>{props.in && props.children}</>;
}

const styles = StyleSheet.create({
  outerContainer: {
    backgroundColor: colors.key00,
    padding: gridUnit * 2,
    flexGrow: 1,
    justifyContent: "center",
  },

  stackContainer: {
    alignItems: "center",
    height: baseCardHeight + gridUnit * 3,
  },

  cardContainer: {
    position: "absolute",
  },

  buttonContainer: {
    justifyContent: "center",
    flexDirection: "row",
    width: cardWidth,
  },

  buttonLayoutStyles: {
    flexGrow: 1,
    flexBasis: 1,
  },
});

const ReviewButtonArea = React.memo(function ReviewButtonArea(props: {
  onMark: (outcome: PromptRepetitionOutcome) => void;
  onPendingMarkingInteractionStateDidChange: (
    state: PendingMarkingInteractionState | null,
  ) => void;
  disabled: boolean;
  promptType: PromptType | null;
}) {
  const { onMark, disabled, promptType } = props;

  return (
    <View style={styles.buttonContainer}>
      <ReviewButton
        onPress={useCallback(() => onMark(PromptRepetitionOutcome.Forgotten), [
          onMark,
        ])}
        disabled={disabled}
        promptType={promptType}
        outcome={PromptRepetitionOutcome.Forgotten}
        extraStyles={styles.buttonLayoutStyles}
      />
      <Spacer size={spacing.spacing05} />
      <ReviewButton
        onPress={useCallback(() => onMark(PromptRepetitionOutcome.Remembered), [
          onMark,
        ])}
        disabled={disabled}
        promptType={promptType}
        outcome={PromptRepetitionOutcome.Remembered}
        extraStyles={styles.buttonLayoutStyles}
      />
    </View>
  );
});
