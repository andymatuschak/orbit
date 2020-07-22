import { boolean, number, withKnobs } from "@storybook/addon-knobs";
import {
  applyActionLogToPromptState,
  AttachmentID,
  AttachmentIDReference,
  getIDForPrompt,
  getIDForPromptTask,
  getIntervalSequenceForSchedule,
  getNextTaskParameters,
  imageAttachmentType,
  MetabookSpacedRepetitionSchedule,
  PromptRepetitionOutcome,
  PromptState,
  PromptTask,
  PromptTaskParameters,
  repetitionActionLogType,
} from "metabook-core";
import {
  testApplicationPrompt,
  testBasicPrompt,
  testClozePrompt,
} from "metabook-sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { AttachmentResolutionMap, PromptReviewItem } from "../reviewItem";
import { layout, colors } from "../styles";
import testCardProps from "./__fixtures__/testCardProps";
import Card from "./Card";
import DebugGrid from "./DebugGrid";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";

const testIntervalSequence = getIntervalSequenceForSchedule("default");

// noinspection JSUnusedGlobalSymbols
export default {
  title: "Card",
  component: Card,
  decorators: [withKnobs],
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
    reviewItem={{
      reviewItemType: "prompt",
      prompt: testBasicPrompt,
      promptParameters: null,
      promptState: null,
      attachmentResolutionMap: null,
    }}
  />
);

export const longText = () => (
  <View>
    <TestCard
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
    />
  </View>
);

export const applicationPrompt = () => (
  <TestCard
    reviewItem={{
      reviewItemType: "prompt",
      prompt: testApplicationPrompt,
      promptParameters: null,
      promptState: null,
      attachmentResolutionMap: null,
    }}
  />
);

export const clozePrompt = () => (
  <View>
    <TestCard
      reviewItem={{
        reviewItemType: "prompt",
        prompt: testClozePrompt,
        promptParameters: { clozeIndex: 1 },
        promptState: null,
        attachmentResolutionMap: null,
      }}
    />
    <TestCard
      reviewItem={{
        reviewItemType: "prompt",
        prompt: {
          ...testClozePrompt,
          body: {
            contents:
              "This is a {cloze\n\nspanning multiple paragraphs\n\nand ending in the middle of} one.",
            attachments: [],
          },
        },
        promptParameters: { clozeIndex: 0 },
        promptState: null,
        attachmentResolutionMap: null,
      }}
    />
  </View>
);

export const image = () => (
  <TestCard
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
  />
);

function TestCard(props: { reviewItem: PromptReviewItem }) {
  const { reviewItem } = props;
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
        {(promptState, reviewMarkingInteractionState, isRevealed) =>
          [isRevealed, true].map((isRevealed, index) => {
            return (
              <View
                key={index}
                style={{
                  width: 375 - 16,
                  height: layout.gridUnit * (5 * 10 + 2), // 2 fixed grid units for caption and its margin; the rest for 2:3 ratio of answer:question
                  borderWidth: 1,
                  borderColor: "gray",
                  margin: 16,
                }}
              >
                {boolean("Show grid", true) && <DebugGrid />}
                <Card
                  {...testCardProps}
                  contextColor={colors.fg[0]}
                  reviewItem={reviewItem}
                  backIsRevealed={isRevealed}
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
    isRevealed: boolean,
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

  const [isRevealed, setRevealed] = useState(false);

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
        {props.children(promptState, reviewMarkingInterationState, isRevealed)}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title="Toggle revealed"
          onPress={() => {
            setRevealed((isRevealed) => !isRevealed);
          }}
        />

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
