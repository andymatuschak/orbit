import { Meta, StoryObj } from "@storybook/react";
import {
  defaultSpacedRepetitionSchedulerConfiguration,
  SpacedRepetitionSchedulerConfiguration,
  TaskComponentState,
} from "@withorbit/core";
import React from "react";
import { View } from "react-native";
import { generateIntervalSequence } from "../util/generateIntervalSequence.js";
import { colors } from "../styles/index.js";
import useLayout from "./hooks/useLayout.js";
import ReviewStarburst, { ReviewStarburstItem } from "./ReviewStarburst.jsx";
import {
  getStarburstQuillInnerRadius,
  getStarburstQuillOuterRadius,
} from "./Starburst.jsx";

const ReviewStarburstStory = ({
  itemCount,
  hasSeenItems,
}: {
  itemCount: number;
  hasSeenItems: boolean;
}) => {
  const { width, height, onLayout } = useLayout();
  const itemStates = Array.from(new Array(itemCount).keys()).map(() =>
    hasSeenItems
      ? generatePromptState(defaultSpacedRepetitionSchedulerConfiguration)
      : null,
  );
  const items: ReviewStarburstItem[] = itemStates.map((component) => ({
    component,
    supportsRetry: false,
    isPendingForSession: true,
  }));
  console.log(
    getStarburstQuillInnerRadius(itemCount, 3),
    getStarburstQuillOuterRadius(itemCount, 3),
  );

  return (
    <View
      onLayout={onLayout}
      style={{
        width: "100%",
        height: 500,
        backgroundColor: colors.palettes.cyan.backgroundColor,
      }}
    >
      {width && (
        <ReviewStarburst
          config={defaultSpacedRepetitionSchedulerConfiguration}
          containerWidth={width}
          containerHeight={height}
          items={items}
          currentItemIndex={0}
          pendingOutcome={null}
          position="left"
          showLegend
          colorMode="bicolor"
          colorPalette={colors.palettes.cyan}
        />
      )}
    </View>
  );
};

const meta = {
  title: "ReviewStarburst",
  component: ReviewStarburstStory,
  args: {
    itemCount: 25,
  },
} satisfies Meta<typeof ReviewStarburstStory>;
export default meta;

function generatePromptState(
  config: SpacedRepetitionSchedulerConfiguration,
): TaskComponentState {
  const sequence = generateIntervalSequence(config);
  const intervalMillis =
    sequence[Math.floor(Math.random() * (sequence.length - 1))].interval;
  return {
    createdAtTimestampMillis: 0,
    lastRepetitionTimestampMillis: Date.now() - intervalMillis,
    intervalMillis,
    dueTimestampMillis: 0,
  };
}

type Story = StoryObj<typeof meta>;
export const NewItems = {
  args: { hasSeenItems: false },
} satisfies Story;

export const OldItems = {
  args: { hasSeenItems: true },
} satisfies Story;
