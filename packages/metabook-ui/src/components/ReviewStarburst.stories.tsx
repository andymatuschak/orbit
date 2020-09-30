import { Story } from "@storybook/react";
import React from "react";
import { View } from "react-native";
import { generateReviewItem } from "./__fixtures__/generateReviewItem";
import useLayout from "./hooks/useLayout";
import { colors } from "../styles";
import ReviewStarburst from "./ReviewStarburst";
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

const Template: Story<StoryArgs> = ({ itemCount, hasSeenItems }) => {
  const { width, height, onLayout } = useLayout();
  const itemStates = Array.from(new Array(itemCount).keys()).map(() =>
    hasSeenItems ? generateReviewItem("Q", "A", "C", "cyan").promptState : null,
  );
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
          itemStates={itemStates}
          currentItemIndex={0}
          currentItemSupportsRetry={true}
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
