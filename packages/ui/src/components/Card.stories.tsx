import { boolean, number } from "@storybook/addon-knobs";
import { Meta, StoryObj } from "@storybook/react";
import {
  AttachmentID,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
  generateUniqueID,
  QATaskContent,
  Task,
} from "@withorbit/core";
import { testClozeSpec, testQASpec } from "@withorbit/sample-data";
import React, { ReactNode, useState } from "react";
import { Button, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem.js";
import { productKeyColor } from "../styles/colors.js";
import { colors, layout } from "../styles/index.js";
import Card from "./Card.jsx";
import DebugGrid from "./DebugGrid.js";

interface CardStoryProps {
  reviewItem: ReviewAreaItem;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;
}
const CardStory = ({ reviewItem, getURLForAttachmentID }: CardStoryProps) => {
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

const meta = {
  title: "Card",
  component: CardStory,
} satisfies Meta<typeof CardStory>;
export default meta;
type Story = StoryObj<typeof meta>;

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

const cardTemplateArgs = {
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

export const Basic = {
  args: {
    ...cardTemplateArgs,
    reviewItem: {
      ...defaultReviewAreaItem,
      spec: makeTestQASpec(),
    },
  },
} satisfies Story;

export const Math = {
  args: {
    ...cardTemplateArgs,
    reviewItem: {
      ...defaultReviewAreaItem,
      spec: makeTestQASpec(
        `Question with $\\sqrt{2}$ inline math and display math:\n\n$$x = \\frac{10}{30x}$$\n\nAnd another paragraph`,
      ),
    },
  },
} satisfies Story;

export const UnorderedList = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;

export const OrderedList = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;

export const LongText = {
  args: {
    ...cardTemplateArgs,
    reviewItem: {
      ...defaultReviewAreaItem,
      spec: makeTestQASpec(
        "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit, mauris ultrices sociis nascetur pretium auctor quisque. Gravida arcu fames euismod vestibulum est nisi habitasse integer eu justo curabitur, nec velit ligula non per dictum rhoncus lacus fermentum taciti, varius pellentesque purus habitant platea cubilia vel mus diam primis.",
        "Faucibus sit at fusce egestas felis per tristique vitae arcu interdum magna, ut fermentum habitasse non parturient sem in vehicula eget sed, hac molestie lacus vestibulum primis laoreet nascetur risus posuere nostra. Blandit scelerisque montes dolor quam varius fermentum eget id, sagittis cursus at elementum fames donec elit,",
      ),
    },
  },
} satisfies Story;

export const ClozePrompt = {
  args: {
    ...cardTemplateArgs,
    reviewItem: {
      ...defaultReviewAreaItem,
      spec: testClozeSpec,
      componentID: Object.entries(testClozeSpec.content.components)[0][0],
    },
  },
} satisfies Story;

export const MultilineClozePrompt = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;

export const ClozePromptWithStrayBrace = {
  args: {
    ...cardTemplateArgs,
    reviewItem: {
      ...defaultReviewAreaItem,
      spec: {
        ...testClozeSpec,
        content: {
          ...testClozeSpec.content,
          body: { text: "This is a test} *cloze prompt*.", attachments: [] },
        },
      },
      componentID: Object.entries(testClozeSpec.content.components)[0][0],
    },
  },
} satisfies Story;

export const ImageQuestion = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;

export const ImageAnswer = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;

export const ImageBothSides = {
  args: {
    ...cardTemplateArgs,
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
  },
} satisfies Story;
