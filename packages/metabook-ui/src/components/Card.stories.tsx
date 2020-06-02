import { number } from "@storybook/addon-knobs";
import {
  applyActionLogToPromptState,
  AttachmentID,
  PromptTask,
  getNextTaskParameters,
  getIDForPromptTask,
  getIDForPrompt,
  repetitionActionLogType,
  AttachmentIDReference,
  getIntervalSequenceForSchedule,
  imageAttachmentType,
  MetabookSpacedRepetitionSchedule,
  PromptState,
  PromptTaskParameters,
  PromptRepetitionOutcome,
} from "metabook-core";
import {
  testApplicationPrompt,
  testBasicPrompt,
  testClozePrompt,
} from "metabook-sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { AttachmentResolutionMap, PromptReviewItem } from "../reviewItem";
import testCardProps from "./__fixtures__/testCardProps";
import Card from "./Card";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";

const testIntervalSequence = getIntervalSequenceForSchedule("default");

// noinspection JSUnusedGlobalSymbols
export default {
  title: "Card",
  component: Card,
};

const testAttachmentIDReference: AttachmentIDReference = {
  type: imageAttachmentType,
  id: "testAttachmentID" as AttachmentID,
  byteLength: 1,
};

const testAttachmentResolutionMap: AttachmentResolutionMap = new Map([
  [
    testAttachmentIDReference.id,
    {
      type: imageAttachmentType,
      url: "https://picsum.photos/200/300",
    },
  ],
]);

export const basic = () => (
  <TestCard
    showsNeedsRetryNotice={false}
    reviewItem={{
      reviewItemType: "prompt",
      prompt: testBasicPrompt,
      promptParameters: null,
      promptState: null,
      attachmentResolutionMap: null,
    }}
    shouldLabelApplicationPrompts={false}
  />
);

export const longText = () => (
  <View>
    <TestCard
      showsNeedsRetryNotice={false}
      reviewItem={{
        reviewItemType: "prompt",
        prompt: {
          ...testBasicPrompt,
          question: {
            attachments: [],
            contents:
              "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit, mauris ultrices sociis nascetur pretium auctor quisque. Gravida arcu fames euismod vestibulum est nisi habitasse integer eu justo curabitur, nec velit ligula non per dictum rhoncus lacus fermentum taciti, varius pellentesque purus habitant platea cubilia vel mus diam primis.",
          },
          answer: {
            attachments: [],
            contents:
              "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit,",
          },
        },
        promptParameters: null,
        promptState: null,
        attachmentResolutionMap: null,
      }}
      shouldLabelApplicationPrompts={false}
    />
  </View>
);

export const applicationPrompt = () => (
  <TestCard
    showsNeedsRetryNotice={false}
    reviewItem={{
      reviewItemType: "prompt",
      prompt: testApplicationPrompt,
      promptParameters: null,
      promptState: null,
      attachmentResolutionMap: null,
    }}
    shouldLabelApplicationPrompts={true}
  />
);

export const clozePrompt = () => (
  <TestCard
    showsNeedsRetryNotice={false}
    reviewItem={{
      reviewItemType: "prompt",
      prompt: testClozePrompt,
      promptParameters: { clozeIndex: 1 },
      promptState: null,
      attachmentResolutionMap: null,
    }}
    shouldLabelApplicationPrompts={true}
  />
);

export const image = () => (
  <TestCard
    showsNeedsRetryNotice={false}
    reviewItem={{
      reviewItemType: "prompt",
      prompt: {
        ...testBasicPrompt,
        question: {
          ...testBasicPrompt.question,
          attachments: [testAttachmentIDReference],
        },
      },
      promptParameters: null,
      promptState: null,
      attachmentResolutionMap: testAttachmentResolutionMap,
    }}
    shouldLabelApplicationPrompts={false}
  />
);

function TestCard(props: {
  showsNeedsRetryNotice: boolean;
  shouldLabelApplicationPrompts: boolean;
  reviewItem: PromptReviewItem;
}) {
  const {
    showsNeedsRetryNotice,
    shouldLabelApplicationPrompts,
    reviewItem,
  } = props;
  return (
    <View>
      <h2>{JSON.stringify(props)}</h2>
      <WithReviewState
        initialBestLevel={null}
        initialCurrentLevel={number("initial current level", 0)}
        intervalSequence={testIntervalSequence}
        schedule="aggressiveStart"
        reviewItem={reviewItem}
      >
        {(promptState, reviewMarkingInteractionState) =>
          [false, true].map((isRevealed, index) => {
            return (
              <View key={index}>
                <Card
                  {...testCardProps}
                  reviewItem={
                    {
                      ...reviewItem,
                      promptState: {
                        ...promptState,
                        needsRetry: showsNeedsRetryNotice,
                      },
                    } as PromptReviewItem
                  }
                  isRevealed={isRevealed}
                  reviewMarkingInteractionState={reviewMarkingInteractionState}
                  showsNeedsRetryNotice={showsNeedsRetryNotice}
                  shouldLabelApplicationPrompts={shouldLabelApplicationPrompts}
                />
              </View>
            );
          })
        }
      </WithReviewState>
    </View>
  );
}

function createPromptState(
  intervalSequence: typeof testIntervalSequence,
  level: number,
  bestLevel: number | null,
  lastReviewTaskParameters: PromptTaskParameters,
): PromptState {
  const interval = intervalSequence[level].interval;
  return {
    intervalMillis: interval,
    bestIntervalMillis:
      bestLevel === null ? null : intervalSequence[bestLevel].interval,
    dueTimestampMillis: Date.now(),
    needsRetry: false,
    lastReviewTaskParameters,
    lastReviewTimestampMillis: Date.now(),
    headActionLogIDs: [],
    taskMetadata: { isDeleted: false, provenance: null },
  };
}

function WithReviewState(props: {
  initialBestLevel: number | null;
  initialCurrentLevel: number;
  intervalSequence: typeof testIntervalSequence;
  schedule: MetabookSpacedRepetitionSchedule;
  reviewItem: PromptReviewItem;
  children: (
    promptState: PromptState,
    reviewMarkingInteractionState: ReviewMarkingInteractionState | null,
  ) => ReactNode;
}) {
  const [promptState, setPromptState] = useState<PromptState>(
    createPromptState(
      props.intervalSequence,
      props.initialCurrentLevel,
      props.initialBestLevel,
      props.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
  );

  /*
  // for knobs
  useEffect(() => {
    setBestLevel(props.initialBestLevel);
  }, [props.initialBestLevel]);
  useEffect(() => {
    setCurrentLevel(props.initialCurrentLevel);
  }, [props.initialCurrentLevel]);
*/
  const [
    reviewMarkingInterationState,
    setReviewMarkingInterationState,
  ] = useState<ReviewMarkingInteractionState | null>(null);

  /*const onHoverDidChange = useCallback(
    (isHovering: boolean, outcome: MetabookActionOutcome) => {
      if (isHovering) {
        if (!reviewMarkingInterationState) {
          setReviewMarkingInterationState({
            outcome,
            status: "pending",
          });
        }
      } else {
        if (
          reviewMarkingInterationState &&
          reviewMarkingInterationState.status === "pending"
        ) {
          setReviewMarkingInterationState(null);
        }
      }
    },
    [reviewMarkingInterationState],
  );*/

  return (
    <View
      style={{
        flex: 1,
        // width: 800,
        justifyContent: "space-between",
        margin: 16,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {props.children(promptState, reviewMarkingInterationState)}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title="Mark remembered"
          onPress={() => {
            setReviewMarkingInterationState({
              outcome: PromptRepetitionOutcome.Remembered,
              status: "committed",
            });
          }}
        />

        <Button
          title="Mark forgotten"
          onPress={() => {
            setReviewMarkingInterationState({
              outcome: PromptRepetitionOutcome.Forgotten,
              status: "committed",
            });
          }}
        />

        <Button
          title="Next round"
          onPress={() => {
            const currentOutcome =
              (reviewMarkingInterationState &&
                reviewMarkingInterationState.status === "committed" &&
                reviewMarkingInterationState.outcome) ||
              null;
            if (!currentOutcome) {
              return;
            }
            setPromptState(
              applyActionLogToPromptState({
                basePromptState: promptState,
                schedule: props.schedule,
                promptActionLog: {
                  parentActionLogIDs: [],
                  timestampMillis:
                    promptState.lastReviewTimestampMillis +
                    promptState.intervalMillis,
                  actionLogType: repetitionActionLogType,
                  context: null,
                  outcome: currentOutcome,
                  taskID: getIDForPromptTask({
                    promptID: getIDForPrompt(props.reviewItem.prompt),
                    promptType: props.reviewItem.prompt.promptType,
                    promptParameters: props.reviewItem.promptParameters,
                  } as PromptTask),
                  taskParameters: getNextTaskParameters(
                    props.reviewItem.prompt,
                    promptState.lastReviewTaskParameters,
                  ),
                },
              }) as PromptState,
            );
            setReviewMarkingInterationState(null);
          }}
        />

        <Button
          title="Reset"
          onPress={() => {
            setReviewMarkingInterationState(null);
            setPromptState(
              createPromptState(
                props.intervalSequence,
                props.initialCurrentLevel,
                props.initialBestLevel,
                props.reviewItem.promptState?.lastReviewTaskParameters ?? null,
              ),
            );
          }}
        />
      </View>
    </View>
  );
}
