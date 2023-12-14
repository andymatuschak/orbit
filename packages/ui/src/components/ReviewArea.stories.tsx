import { boolean, number, text, withKnobs } from "@storybook/addon-knobs";
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
import { AttachmentID } from "@withorbit/core";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
  decorators: [withKnobs],
};

type ReviewAreaTemplateProps = {
  colorKnobOffset: number;
  questionOverrideText: string;
  answerOverrideText: string;
  sourceContext: string;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;
};

function ReviewAreaTemplate({
  colorKnobOffset,
  questionOverrideText,
  answerOverrideText,
  sourceContext,
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
        {boolean("Show debug grid", false) && <DebugGrid />}
        <ReviewArea
          items={items}
          sizeClass={getWidthSizeClass(width)}
          insetBottom={number("Bottom safe inset", 0)}
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

export function Basic() {
  const colorKnobOffset = number("color shift", 0, {
    min: 0,
    max: Object.keys(colors.palettes).length - 1,
    step: 1,
    range: true,
  });

  const questionOverrideText = text("Question override text", "");
  const answerOverrideText = text("Answer override text", "");
  const sourceContext = text("Source context", "");

  return (
    <ReviewAreaTemplate
      getURLForAttachmentID={useCallback(async () => "", [])}
      colorKnobOffset={colorKnobOffset}
      questionOverrideText={questionOverrideText}
      answerOverrideText={answerOverrideText}
      sourceContext={sourceContext}
    />
  );
}

export function OverflowingPrompt() {
  const colorKnobOffset = number("color shift", 0, {
    min: 0,
    max: Object.keys(colors.palettes).length - 1,
    step: 1,
    range: true,
  });

  const questionOverrideText = text(
    "Question override text",
    `
  What's the role of memory in this story?

  1. Betsy wanted to bring Jacob a present.
  2. She shook her piggy bank.
  3. It made no sound.
  4. She went to look for her mother.
  `,
  );
  const answerOverrideText = text(
    "Answer override text",
    `You must know many things to make sense of even this simple story: e.g. presents are usually purchased (not repurposed); children keep coins (not bills) in piggy banks, so no sound means no money; etc.`,
  );
  const sourceContext = text("Source context", "");

  return (
    <ReviewAreaTemplate
      getURLForAttachmentID={useCallback(async () => "", [])}
      colorKnobOffset={colorKnobOffset}
      questionOverrideText={questionOverrideText}
      answerOverrideText={answerOverrideText}
      sourceContext={sourceContext}
    />
  );
}
