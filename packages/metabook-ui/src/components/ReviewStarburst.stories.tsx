import { Story } from "@storybook/react";
import React from "react";
import { View } from "react-native";
import { generateReviewItem } from "./__fixtures__/generateReviewItem";
import useLayout from "./hooks/useLayout";
import { colors } from "../styles";
import ReviewStarburst from "./ReviewStarburst";

export default {
  title: "ReviewStarburst",
  component: ReviewStarburst,
};

interface StoryArgs {
  itemCount: number;
}

export const Basic: Story<StoryArgs> = ({ itemCount }) => {
  const { width, height, onLayout } = useLayout();
  const reviewItems = Array.from(new Array(itemCount).keys()).map(() => ({
    ...generateReviewItem("Q", "A", "C", "cyan"),
    promptState: null,
  }));
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
          items={reviewItems}
          currentItemIndex={0}
          pendingOutcome={null}
          position="left"
          showLegend
          colorMode="bicolor"
          overrideColorPalette={colors.palettes.cyan}
        />
      )}
    </View>
  );
};

Basic.args = {
  itemCount: 25,
};
