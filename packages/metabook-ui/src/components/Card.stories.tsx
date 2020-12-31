import { boolean, number, text } from "@storybook/addon-knobs";
import { Story } from "@storybook/react";
import {
  AttachmentID,
  AttachmentIDReference,
  getIntervalSequenceForSchedule,
  imageAttachmentType,
  MetabookSpacedRepetitionSchedule,
  PromptProvenanceType,
  QAPrompt,
} from "metabook-core";
import {
  testApplicationPrompt,
  testClozePrompt,
  testQAPrompt,
} from "metabook-sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { AttachmentResolutionMap, ReviewAreaItem } from "../reviewAreaItem";
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
      url: "https://picsum.photos/200/300",
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

export const Image = CardTemplate.bind({});
Image.args = {
  ...CardTemplate.args,
  prompt: {
    ...testQAPrompt,
    question: {
      ...testQAPrompt.question,
      attachments: [testAttachmentIDReference],
    },
  },
  attachmentResolutionMap: testAttachmentResolutionMap,
};
