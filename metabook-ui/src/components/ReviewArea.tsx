import isEqual from "lodash.isequal";
import {
  MetabookActionOutcome,
  MetabookSpacedRepetitionSchedule,
  PromptSpecType,
  PromptState,
  PromptTask,
} from "metabook-core";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Button,
  StyleProp,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from "react-native";
import colors from "../styles/colors";
import { gridUnit } from "../styles/layout";
import Card, { baseCardHeight } from "./Card";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";
import WithAnimatedValue = Animated.WithAnimatedValue;

const promptReviewTaskType = "prompt";
export type PromptReviewTask = {
  type: typeof promptReviewTaskType;
  promptState: PromptState | null;
  promptTask: PromptTask;
};

type InternalReviewTask =
  | ReviewTask
  | { type: "completedQuestion"; markingRecord: ReviewAreaMarkingRecord };

export type ReviewAreaMarkingRecord = {
  reviewTask: PromptReviewTask;
  outcome: MetabookActionOutcome;
};

export type ReviewTask = PromptReviewTask /* | LoginReviewTask TODO */;

export interface ReviewAreaProps {
  tasks: ReviewTask[];
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
  pendingActionOutcome: MetabookActionOutcome;
  status: "hover" | "active";
}

function getTransformForStackIndex(stackIndex: number) {
  return { scale: 1 - stackIndex * 0.05, translateY: stackIndex * 20 };
}

function getRenderedTaskIndexFromRenderNodeIndex(
  renderNodeIndex: number,
  phase: number,
  maximumCardsToRender: number,
) {
  const renderedTaskIndex =
    (((renderNodeIndex - phase) % maximumCardsToRender) +
      maximumCardsToRender) %
    maximumCardsToRender;
  return renderedTaskIndex;
}

function CardRenderer({
  departingMarkingRecordQueueRef,
  maximumCardsToDisplay,
  renderedStackIndex,
  setPhase,
  task,
  children,
}: {
  task: InternalReviewTask;
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
    task !== null &&
    task.type !== "completedQuestion" &&
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
    tasks,
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
  const previousTasks = usePrevious(props.tasks);

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

  const currentTask = tasks[0] || null;
  const onMarkingButton = useCallback(
    (outcome: MetabookActionOutcome) => {
      if (currentTask && currentTask.type === "prompt") {
        const markingRecord = { reviewTask: currentTask, outcome };
        lastCommittedReviewMarkingRef.current = markingRecord;
        onMark(markingRecord /*, currentCardHandleRef.current! TODO */);
      } else {
        throw new Error(`Marked invalid task: ${currentTask}`);
      }
    },
    [currentTask, onMark],
  );

  const onPress = useCallback(() => {
    if (!isShowingAnswer && currentTask && currentTask.type === "prompt") {
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
  }, [isShowingAnswer, currentTask]);

  const onToggleTopCardExplanation = useCallback(
    (isExplanationExpanded) => {
      if (currentTask?.type !== "prompt") {
        throw new Error(
          "How are we toggling the top card's explanation when it's not a question?",
        );
      }
      /* TODO context?.onToggleExplanation(
        isExplanationExpanded,
        currentTask.cardData.cardID,
        currentTask.promptIndex,
      ); */
    },
    [currentTask /*, context*/],
  );

  const departingMarkingRecordQueueRef = useRef<ReviewAreaMarkingRecord[]>([]);

  const isComplete = tasks.length === 0 && !!showsCompletedState;

  const maximumCardsToDisplay = 3;
  const maximumCardsToRender = 5;
  //const maximumCardsToDisplay = window.innerHeight >= 568 ? 3 : 1; // TODO
  //const maximumCardsToRender = window.innerHeight >= 568 ? 5 : 3;

  if (
    lastCommittedReviewMarkingRef.current &&
    !isEqual(previousTasks, tasks) &&
    previousTasks &&
    isShowingAnswer
  ) {
    setShowingAnswer(false);
    if (isEqual(previousTasks[1], tasks[0])) {
      departingMarkingRecordQueueRef.current.push(
        lastCommittedReviewMarkingRef.current,
      );
      lastCommittedReviewMarkingRef.current = null;
    }
  }

  const renderedTasks = departingMarkingRecordQueueRef.current
    .map(
      (markingRecord) =>
        ({
          type: "completedQuestion",
          markingRecord,
        } as InternalReviewTask),
    )
    .concat(tasks)
    .slice(0, maximumCardsToRender);

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
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
                const renderedTaskIndex = getRenderedTaskIndexFromRenderNodeIndex(
                  renderNodeIndex,
                  phase,
                  maximumCardsToRender,
                );
                const task: InternalReviewTask | null =
                  renderedTasks[renderedTaskIndex] || null;

                // The rendered stack index is 0 for the card that's currently on top, 1 for the next card down, -1 for the card that's currently animating out.
                const renderedStackIndex =
                  renderedTaskIndex -
                  departingMarkingRecordQueueRef.current.length;
                const isRevealed =
                  (isShowingAnswer && renderedStackIndex === 0) ||
                  renderedStackIndex < 0;

                let cardComponent: React.ReactNode;

                if (task === null) {
                  cardComponent = null;
                  /*} TODO else if (task.type === "login") {
                cardComponent = (
                  <div className="Card LoginCard">
                    <Login
                      isActive={renderedStackIndex === 0}
                      onLogin={onLogin}
                      userState={task.userState}
                    />
                  </div>
                ); */
                } else {
                  let reviewTask: PromptReviewTask;
                  let reviewMarkingInteractionState: ReviewMarkingInteractionState | null;

                  if (task.type === "prompt") {
                    reviewTask = task;
                    if (
                      lastCommittedReviewMarkingRef.current &&
                      isEqual(
                        lastCommittedReviewMarkingRef.current.reviewTask,
                        reviewTask,
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
                    reviewTask = task.markingRecord.reviewTask;
                    reviewMarkingInteractionState = {
                      status: "committed",
                      outcome: task.markingRecord.outcome,
                    };
                  }

                  cardComponent = (
                    <Card
                      isRevealed={isRevealed}
                      isOccluded={renderedStackIndex > 0}
                      promptTask={reviewTask.promptTask}
                      promptState={reviewTask.promptState}
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
                    task={task}
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
          <View
          // TODO style={{ opacity: isComplete ? 0 : 1 }}
          >
            <ReviewButtonArea
              onMark={onMarkingButton}
              onPendingMarkingInteractionStateDidChange={
                setPendingMarkingInteractionState
              }
              disabled={!isShowingAnswer || tasks.length === 0}
              promptSpecType={
                currentTask?.type === "prompt"
                  ? currentTask.promptTask.spec.promptSpecType
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
  },
});

function ReviewButtonArea(props: {
  onMark: (outcome: MetabookActionOutcome) => void;
  onPendingMarkingInteractionStateDidChange: (
    state: PendingMarkingInteractionState | null,
  ) => void;
  disabled: boolean;
  promptSpecType: PromptSpecType | null;
}) {
  const {
    onMark,
    onPendingMarkingInteractionStateDidChange,
    disabled,
    promptSpecType,
  } = props;

  const isApplicationPrompt = promptSpecType === "applicationPrompt";

  return (
    <View style={styles.buttonContainer}>
      <Button
        onPress={useCallback(() => onMark("forgotten"), [onMark])}
        // onStatusDidChange={useCallback(
        //   status =>
        //     onPendingMarkingInteractionStateDidChange(
        //       status === "inactive"
        //         ? null
        //         : {
        //           status,
        //           pendingReviewMarking: "forgotten",
        //         },
        //     ),
        //   [onPendingMarkingInteractionStateDidChange],
        // )}
        // glyph={<RetryGlyph />} TODO
        disabled={disabled}
        title={isApplicationPrompt ? "Couldn’t answer" : "Didn’t remember"}
      />
      <Button
        onPress={useCallback(() => onMark("remembered"), [onMark])}
        // onStatusDidChange={useCallback(
        //   status =>
        //     onPendingMarkingInteractionStateDidChange(
        //       status === "inactive"
        //         ? null
        //         : {
        //           status,
        //           pendingReviewMarking: "remembered",
        //         },
        //     ),
        //   [onPendingMarkingInteractionStateDidChange],
        // )}
        // glyph={<CheckGlyph />}
        disabled={disabled}
        title={isApplicationPrompt ? "Answered" : "Remembered"}
      />
    </View>
  );
}
