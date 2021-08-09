import { Story } from "@storybook/react";
import {
  defaultSpacedRepetitionSchedulerConfiguration,
  SpacedRepetitionSchedulerConfiguration,
  TaskComponentState,
} from "@withorbit/core2";
import React from "react";
import { View } from "react-native";
import { generateIntervalSequence } from "../util/generateIntervalSequence";
import { colors } from "../styles";
import useLayout from "./hooks/useLayout";
import ReviewStarburst, { ReviewStarburstItem } from "./ReviewStarburst";
import {
  getStarburstQuillInnerRadius,
  getStarburstQuillOuterRadius,
} from "./Starburst";

export default {
  title: "ReviewStarburst",
  component: ReviewStarburst,
};

interface StoryArgs {
  itemCount: number;
  hasSeenItems: boolean;
}

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

const Template: Story<StoryArgs> = ({ itemCount, hasSeenItems }) => {
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
        height: "100vh",
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

Template.args = {
  itemCount: 25,
};

export const NewItems = Template.bind({});
NewItems.args = { ...Template.args, hasSeenItems: false };

export const OldItems = Template.bind({});
OldItems.args = { ...Template.args, hasSeenItems: true };
