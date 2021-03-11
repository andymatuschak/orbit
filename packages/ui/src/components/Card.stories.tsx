import { boolean, number } from "@storybook/addon-knobs";
import { Story } from "@storybook/react";
import {
  AttachmentID,
  AttachmentIDReference,
  AttachmentResolutionMap,
  getIntervalSequenceForSchedule,
  imageAttachmentType,
  MetabookSpacedRepetitionSchedule,
  PromptProvenanceType,
  QAPrompt,
} from "@withorbit/core";
import {
  testApplicationPrompt,
  testClozePrompt,
  testQAPrompt,
} from "@withorbit/sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem";
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

function WithReviewState(props: {
  initialBestLevel: number | null;
  initialCurrentLevel: number;
  intervalSequence: typeof testIntervalSequence;
  schedule: MetabookSpacedRepetitionSchedule;
  reviewItem: ReviewAreaItem;
  children: (isRevealed: boolean) => ReactNode;
}) {
  const [isRevealed, setRevealed] = useState(false);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "space-between",
        margin: 16,
      }}
    >
      <View style={{ flexDirection: "row" }}>{props.children(isRevealed)}</View>
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

const CardTemplate: Story<ReviewAreaItem> = (reviewItem) => {
  return (
    <View>
      <h2>{JSON.stringify(reviewItem)}</h2>
      <WithReviewState
        initialBestLevel={null}
        initialCurrentLevel={number("initial current level", 0)}
        intervalSequence={testIntervalSequence}
        schedule="aggressiveStart"
        reviewItem={reviewItem}
      >
        {(isRevealed) =>
          [isRevealed, true].map((isRevealed, index) => {
            return (
              <View
                key={index}
                style={{
                  width: 375 - 16,
                  height: layout.gridUnit * (5 * 10 + 3), // 2 fixed grid units for caption and its margin; 1 for the space between question and answer; the rest for 2:3 ratio of answer:question
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
};

CardTemplate.args = {
  provenance: {
    provenanceType: PromptProvenanceType.Note,
    title:
      "Example note with extremely long title which will get truncated eventually like perhaps in the middle of this line",
    url: "http://note.example",
    externalID: "testID",
    modificationTimestampMillis: 0,
  },
  colorPalette: colors.palettes.orange,
  taskParameters: null,
  promptParameters: null,
  attachmentResolutionMap: null,
};

function makeTestQAPrompt(question?: string, answer?: string): QAPrompt {
  return {
    ...testQAPrompt,
    question: {
      contents: question ?? testQAPrompt.question.contents,
      attachments: [],
    },
    answer: {
      contents: answer ?? testQAPrompt.answer.contents,
      attachments: [],
    },
  };
}

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
      url: "https://picsum.photos/539/323",
    },
  ],
]);

export const Basic = CardTemplate.bind({});
Basic.args = {
  ...CardTemplate.args,
  prompt: makeTestQAPrompt(),
};

export const Math = CardTemplate.bind({});
Math.args = {
  ...CardTemplate.args,
  prompt: makeTestQAPrompt(
    `Question with $\\sqrt{2}$ inline math and display math:\n\n$$x = \\frac{10}{30x}$$\n\nAnd another paragraph`,
  ),
};

export const UnorderedList = CardTemplate.bind({});
UnorderedList.args = {
  ...CardTemplate.args,
  prompt: makeTestQAPrompt(
    `Test with an unordered list this is a long line to start us off
            
* First item
* Second item which is longer to show a second line.
* Third item

Another paragraph`,
  ),
};

export const OrderedList = CardTemplate.bind({});
OrderedList.args = {
  ...CardTemplate.args,
  prompt: makeTestQAPrompt(
    `Test with an ordered list this is a long line to start us off
            
1. First item
1. Second item which is longer to show a second line.
1. Third item

Another paragraph`,
  ),
};

export const LongText = CardTemplate.bind({});
LongText.args = {
  ...CardTemplate.args,
  prompt: makeTestQAPrompt(
    "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit, mauris ultrices sociis nascetur pretium auctor quisque. Gravida arcu fames euismod vestibulum est nisi habitasse integer eu justo curabitur, nec velit ligula non per dictum rhoncus lacus fermentum taciti, varius pellentesque purus habitant platea cubilia vel mus diam primis.",
    "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit,",
  ),
};

export const ApplicationPrompt = CardTemplate.bind({});
ApplicationPrompt.args = {
  ...CardTemplate.args,
  prompt: testApplicationPrompt,
  taskParameters: { variantIndex: 0 },
};

export const ClozePrompt = CardTemplate.bind({});
ClozePrompt.args = {
  ...CardTemplate.args,
  prompt: testClozePrompt,
  promptParameters: { clozeIndex: 1 },
};

export const MultilineClozePrompt = CardTemplate.bind({});
MultilineClozePrompt.args = {
  ...CardTemplate.args,
  prompt: {
    ...testClozePrompt,
    body: {
      contents:
        "This is a {cloze\n\nspanning multiple paragraphs\n\nand ending in the middle of} one.",
      attachments: [],
    },
  },
  promptParameters: { clozeIndex: 0 },
};

export const ImageQuestion = CardTemplate.bind({});
ImageQuestion.args = {
  ...CardTemplate.args,
  prompt: {
    ...testQAPrompt,
    question: {
      contents:
        "In the following diagram of an edgeworth box, how much food is being produced?",
      attachments: [testAttachmentIDReference],
    },
  },
  attachmentResolutionMap: testAttachmentResolutionMap,
};

export const ImageAnswer = CardTemplate.bind({});
ImageAnswer.args = {
  ...CardTemplate.args,
  prompt: {
    ...testQAPrompt,
    answer: {
      contents:
        "In the following diagram of an edgeworth box, how much food is being produced?",
      attachments: [testAttachmentIDReference],
    },
  },
  attachmentResolutionMap: testAttachmentResolutionMap,
};

export const ImageBothSides = CardTemplate.bind({});
ImageBothSides.args = {
  ...CardTemplate.args,
  prompt: {
    ...testQAPrompt,
    question: {
      contents:
        "In the following diagram of an edgeworth box, what region would offer both more food and shelter compared to the current allocation? (Visualize the answer)",
      attachments: [testAttachmentIDReference],
    },
    answer: {
      contents: "Anywhere in the blue shaded area.",
      attachments: [testAttachmentIDReference],
    },
  },
  attachmentResolutionMap: testAttachmentResolutionMap,
};
