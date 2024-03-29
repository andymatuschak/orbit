import { boolean, number } from "@storybook/addon-knobs";
import { Story } from "@storybook/react";
import { testClozeSpec, testQASpec } from "@withorbit/sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem";
import { colors, layout } from "../styles";
import { productKeyColor } from "../styles/colors";
import Card from "./Card";
import DebugGrid from "./DebugGrid";
import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
  generateUniqueID,
  QATaskContent,
  Task,
} from "@withorbit/core";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "Card",
  component: Card,
};

function WithReviewState(props: {
  initialBestLevel: number | null;
  initialCurrentLevel: number;
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

const CardTemplate: Story<{
  reviewItem: ReviewAreaItem;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;
}> = ({ reviewItem, getURLForAttachmentID }) => {
  return (
    <View>
      <h2>{JSON.stringify(reviewItem)}</h2>
      <WithReviewState
        initialBestLevel={null}
        initialCurrentLevel={number("initial current level", 0)}
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
                  accentColor={productKeyColor}
                  reviewItem={reviewItem}
                  backIsRevealed={isRevealed}
                  getURLForAttachmentID={getURLForAttachmentID}
                />
              </View>
            );
          })
        }
      </WithReviewState>
    </View>
  );
};

const defaultReviewAreaItem: ReviewAreaItem = {
  taskID: generateUniqueID(),
  provenance: {
    title:
      "Example note with extremely long title which will get truncated eventually like perhaps in the middle of this line",
    url: "http://note.example",
    identifier: "testID",
  },
  spec: testQASpec,
  componentID: "",
  colorPalette: colors.palettes.orange,
};

CardTemplate.args = {
  reviewItem: defaultReviewAreaItem,
  getURLForAttachmentID: async () => "",
};

function makeTestQASpec(
  question?: string,
  answer?: string,
): Task<QATaskContent>["spec"] {
  return {
    ...testQASpec,
    content: {
      ...testQASpec.content,
      body: {
        text: question ?? testQASpec.content.body.text,
        attachments: [],
      },
      answer: {
        text: answer ?? testQASpec.content.answer.text,
        attachments: [],
      },
    },
  };
}

const testAttachmentIDReference: AttachmentReference = {
  type: EntityType.AttachmentReference,
  mimeType: AttachmentMIMEType.PNG,
  id: "testAttachmentID" as AttachmentID,
  createdAtTimestampMillis: 0,
};

export const Basic = CardTemplate.bind({});
Basic.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: makeTestQASpec(),
  },
};

export const Math = CardTemplate.bind({});
Math.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: makeTestQASpec(
      `Question with $\\sqrt{2}$ inline math and display math:\n\n$$x = \\frac{10}{30x}$$\n\nAnd another paragraph`,
    ),
  },
};

export const UnorderedList = CardTemplate.bind({});
UnorderedList.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: makeTestQASpec(
      `Test with an unordered list this is a long line to start us off
              
  * First item
  * Second item which is longer to show a second line.
  * Third item
  
  Another paragraph`,
    ),
  },
};

export const OrderedList = CardTemplate.bind({});
OrderedList.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: makeTestQASpec(
      `Test with an ordered list this is a long line to start us off
              
  1. First item
  1. Second item which is longer to show a second line.
  1. Third item
  
  Another paragraph`,
    ),
  },
};

export const LongText = CardTemplate.bind({});
LongText.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: makeTestQASpec(
      "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit, mauris ultrices sociis nascetur pretium auctor quisque. Gravida arcu fames euismod vestibulum est nisi habitasse integer eu justo curabitur, nec velit ligula non per dictum rhoncus lacus fermentum taciti, varius pellentesque purus habitant platea cubilia vel mus diam primis.",
      "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit,",
    ),
  },
};

export const ClozePrompt = CardTemplate.bind({});
ClozePrompt.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: testClozeSpec,
    componentID: Object.entries(testClozeSpec.content.components)[0][0],
  },
};

export const MultilineClozePrompt = CardTemplate.bind({});
MultilineClozePrompt.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: {
      ...testClozeSpec,
      content: {
        ...testClozeSpec.content,
        body: {
          text: "This is a cloze\n\nspanning multiple paragraphs\n\nand ending in the middle of one.",
          attachments: [],
        },
        components: {
          a: {
            order: 0,
            ranges: [
              {
                startIndex: 10,
                length: 64,
                hint: null,
              },
            ],
          },
        },
      },
    },
    componentID: "a",
  },
};

export const ImageQuestion = CardTemplate.bind({});
ImageQuestion.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: {
      ...testQASpec,
      content: {
        ...testQASpec.content,
        body: {
          text: "In the following diagram of an edgeworth box, how much food is being produced?",
          attachments: [testAttachmentIDReference.id],
        },
      },
    },
  },
  getURLForAttachmentID: async () => "https://picsum.photos/id/200/539/323",
};

export const ImageAnswer = CardTemplate.bind({});
ImageAnswer.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: {
      ...testQASpec,
      content: {
        ...testQASpec.content,
        answer: {
          text: "In the following diagram of an edgeworth box, how much food is being produced?",
          attachments: [testAttachmentIDReference.id],
        },
      },
    },
  },
  getURLForAttachmentID: async () => "https://picsum.photos/id/200/539/323",
};

export const ImageBothSides = CardTemplate.bind({});
ImageBothSides.args = {
  ...CardTemplate.args,
  reviewItem: {
    ...defaultReviewAreaItem,
    spec: {
      ...testQASpec,
      content: {
        ...testQASpec.content,
        body: {
          text: "In the following diagram of an edgeworth box, what region would offer both more food and shelter compared to the current allocation? (Visualize the answer)",
          attachments: [testAttachmentIDReference.id],
        },
        answer: {
          text: "In the following diagram of an edgeworth box, how much food is being produced?",
          attachments: [testAttachmentIDReference.id],
        },
      },
    },
  },
  getURLForAttachmentID: async () => "https://picsum.photos/id/200/539/323",
};
