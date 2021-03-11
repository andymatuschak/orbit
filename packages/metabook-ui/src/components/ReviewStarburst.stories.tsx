import { Story } from "@storybook/react";
import { getIntervalSequenceForSchedule, PromptState } from "@withorbit/core";
import React from "react";
import { View } from "react-native";
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

const intervalSequence = getIntervalSequenceForSchedule("default");

function generatePromptState(): PromptState {
  const intervalMillis =
    intervalSequence[Math.floor(Math.random() * (intervalSequence.length - 1))]
      .interval;
  return {
    dueTimestampMillis: 0,
    headActionLogIDs: [],
    intervalMillis,
    bestIntervalMillis: null,
    lastReviewTaskParameters: null,
    lastReviewTimestampMillis: Date.now() - intervalMillis,
    needsRetry: false,
    taskMetadata: {
      isDeleted: false,
      provenance: null,
    },
  };
}

const Template: Story<StoryArgs> = ({ itemCount, hasSeenItems }) => {
  const { width, height, onLayout } = useLayout();
  const itemStates = Array.from(new Array(itemCount).keys()).map(() =>
    hasSeenItems ? generatePromptState() : null,
  );
  const items: ReviewStarburstItem[] = itemStates.map((promptState) => ({
    promptState,
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
