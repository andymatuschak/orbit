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
export const Basic: Story<{}> = () => {
  const { width, height, onLayout } = useLayout();
  const reviewItems = Array.from(new Array(25).keys()).map(() =>
    generateReviewItem("Q", "A", "C", "cyan"),
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
          items={reviewItems}
          currentItemIndex={0}
          pendingOutcome={null}
          position="left"
          showLegend
          colorMode="bicolor"
        />
      )}
    </View>
  );
};
