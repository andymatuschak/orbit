import type { Meta, StoryObj } from "@storybook/react-webpack5";
import type { AttachmentID } from "@withorbit/core";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem.js";
import { colors } from "../styles/index.js";
import { getWidthSizeClass } from "../styles/layout.js";
import { generateReviewItem } from "./__fixtures__/generateReviewItem.js";
import DebugGrid from "./DebugGrid.js";
import useLayout from "./hooks/useLayout.js";
import { useTransitioningColorValue } from "./hooks/useTransitioningValue.js";
import ReviewArea from "./ReviewArea.jsx";

type ReviewAreaTemplateProps = {
  colorKnobOffset: number;
  questionOverrideText: string;
  answerOverrideText: string;
  sourceContext: string;
  showDebugGrid: boolean;
  insetBottom: number;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;
};

function ReviewAreaTemplate({
  colorKnobOffset,
  questionOverrideText,
  answerOverrideText,
  sourceContext,
  showDebugGrid,
  insetBottom,
  getURLForAttachmentID,
}: ReviewAreaTemplateProps) {
  const items = useMemo<ReviewAreaItem[]>(
    () =>
      Array.from(new Array(25).keys()).map((i) =>
        generateReviewItem(
          questionOverrideText || `Question ${i + 1}`,
          answerOverrideText || `Answer ${i + 1}`,
          sourceContext,
          colors.orderedPaletteNames[
            (i + colorKnobOffset) % colors.orderedPaletteNames.length
          ],
        ),
      ),
    [questionOverrideText, answerOverrideText, sourceContext, colorKnobOffset],
  );

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const backgroundColor = useTransitioningColorValue({
    value:
      colors.palettes[
        colors.orderedPaletteNames[
          (currentItemIndex + colorKnobOffset) %
            colors.orderedPaletteNames.length
        ]
      ].backgroundColor,
    timing: {
      type: "timing",
      duration: 150,
      easing: Easing.linear,
      useNativeDriver: false,
    },
  });

  const { width, onLayout } = useLayout();

  return (
    <Animated.View
      style={{
        backgroundColor,
        height: 1000,
      }}
      onLayout={onLayout}
    >
      <View style={{ flex: 1 }}>
        {showDebugGrid && <DebugGrid />}
        <ReviewArea
          items={items}
          sizeClass={getWidthSizeClass(width)}
          insetBottom={insetBottom}
          onPendingOutcomeChange={useCallback(() => {
            return;
          }, [])}
          getURLForAttachmentID={getURLForAttachmentID}
          onMark={useCallback(
            () =>
              setCurrentItemIndex((currentItemIndex) => currentItemIndex + 1),
            [],
          )}
          currentItemIndex={currentItemIndex}
        />
      </View>
    </Animated.View>
  );
}

const meta = {
  title: "ReviewArea",
  component: ReviewAreaTemplate,
  args: {
    colorKnobOffset: 0,
    questionOverrideText: "",
    answerOverrideText: "",
    sourceContext: "",
    showDebugGrid: false,
    insetBottom: 0,
    getURLForAttachmentID: async () => "",
  },
  argTypes: {
    colorKnobOffset: {
      name: "color shift",
      control: {
        type: "range",
        min: 0,
        max: Object.keys(colors.palettes).length - 1,
        step: 1,
      },
    },
    questionOverrideText: {
      name: "Question override text",
      control: "text",
    },
    answerOverrideText: {
      name: "Answer override text",
      control: "text",
    },
    sourceContext: {
      name: "Source context",
      control: "text",
    },
    showDebugGrid: {
      name: "Show debug grid",
      control: "boolean",
    },
    insetBottom: {
      name: "Bottom safe inset",
      control: "number",
    },
    getURLForAttachmentID: {
      control: false,
    },
  },
} satisfies Meta<typeof ReviewAreaTemplate>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Basic = {} satisfies Story;

export const OverflowingPrompt = {
  args: {
    questionOverrideText: `
  What's the role of memory in this story?

  1. Betsy wanted to bring Jacob a present.
  2. She shook her piggy bank.
  3. It made no sound.
  4. She went to look for her mother.
  `,
    answerOverrideText: `You must know many things to make sense of even this simple story: e.g. presents are usually purchased (not repurposed); children keep coins (not bills) in piggy banks, so no sound means no money; etc.`,
  },
} satisfies Story;
