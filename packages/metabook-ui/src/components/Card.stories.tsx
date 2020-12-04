import { boolean, number, text, withKnobs } from "@storybook/addon-knobs";
import {
  AttachmentID,
  AttachmentIDReference,
  getIntervalSequenceForSchedule,
  imageAttachmentType,
  MetabookSpacedRepetitionSchedule,
  PromptProvenanceType,
  PromptState,
  PromptTaskParameters,
} from "metabook-core";
import {
  testApplicationPrompt,
  testQAPrompt,
  testClozePrompt,
} from "metabook-sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { AttachmentResolutionMap, PromptReviewItem } from "../reviewItem";
import { colors, layout } from "../styles";
import { productKeyColor } from "../styles/colors";
import testCardProps from "./__fixtures__/testCardProps";
import Card from "./Card";
import DebugGrid from "./DebugGrid";

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

const promptStateWithProvenance = {
  taskMetadata: {
    provenance: {
      provenanceType: PromptProvenanceType.Note,
      title:
        "Example note with extremely long title which will get truncated eventually like perhaps in the middle of this line",
      url: "http://note.example",
    },
  },
} as PromptState;

export const basic = () => (
  <TestCard
    reviewItem={{
      reviewItemType: "prompt",
      prompt: {
        ...testQAPrompt,
        question: {
          contents: text("Question", testQAPrompt.question.contents),
          attachments: [],
        },
        answer: {
          contents: text("Answer", testQAPrompt.answer.contents),
          attachments: [],
        },
      },
      promptParameters: null,
      promptState: promptStateWithProvenance,
      attachmentResolutionMap: null,
    }}
  />
);

export const math = () => (
  <TestCard
    reviewItem={{
      reviewItemType: "prompt",
      prompt: {
        ...testQAPrompt,
        question: {
          contents: text(
            "Question",
            `Question with $\\sqrt{2}$ inline math and display math:\n\n$$x = \\frac{10}{30x}$$\n\nAnd another paragraph`,
          ),
          attachments: [],
        },
        answer: {
          contents: text("Answer", testQAPrompt.answer.contents),
          attachments: [],
        },
      },
      promptParameters: null,
      promptState: promptStateWithProvenance,
      attachmentResolutionMap: null,
    }}
  />
);

export const unorderedList = () => (
  <TestCard
    reviewItem={{
      reviewItemType: "prompt",
      prompt: {
        ...testQAPrompt,
        question: {
          contents: text(
            "Question",
            `Test with an unordered list this is a long line to start us off
            
* First item
* Second item which is longer to show a second line.
* Third item

Another paragraph`,
          ),
          attachments: [],
        },
        answer: {
          contents: text("Answer", testQAPrompt.answer.contents),
          attachments: [],
        },
      },
      promptParameters: null,
      promptState: promptStateWithProvenance,
      attachmentResolutionMap: null,
    }}
  />
);

export const orderedList = () => (
  <TestCard
    reviewItem={{
      reviewItemType: "prompt",
      prompt: {
        ...testQAPrompt,
        question: {
          contents: text(
            "Question",
            `Test with an ordered list this is a long line to start us off
            
1. First item
1. Second item which is longer to show a second line.
1. Third item`,
          ),
          attachments: [],
        },
        answer: {
          contents: text("Answer", testQAPrompt.answer.contents),
          attachments: [],
        },
      },
      promptParameters: null,
      promptState: promptStateWithProvenance,
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
          ...testQAPrompt,
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
        promptState: promptStateWithProvenance,
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
        ...testQAPrompt,
        question: {
          ...testQAPrompt.question,
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
        {(promptState, isRevealed) =>
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
                  accentColor={productKeyColor}
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
  children: (promptState: PromptState, isRevealed: boolean) => ReactNode;
}) {
  const [promptState] = useState<PromptState>(
    createPromptState(
      props.intervalSequence,
      props.initialCurrentLevel,
      props.initialBestLevel,
      props.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
  );

  const [isRevealed, setRevealed] = useState(false);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        margin: 16,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {props.children(promptState, isRevealed)}
      </View>
      <View style={{ flexDirection: "row" }}>
        <Button
          title="Toggle revealed"
          onPress={() => {
            setRevealed((isRevealed) => !isRevealed);
          }}
        />
      </View>
    </View>
  );
}
