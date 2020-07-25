import { testBasicPrompt } from "metabook-sample-data";
import React, { useCallback, useState } from "react";
import { Easing, View, Animated } from "react-native";
import { ReviewItem } from "../reviewItem";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import ReviewArea from "./ReviewArea";
import { colors } from "../styles";
import { number, withKnobs } from "@storybook/addon-knobs";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
  decorators: [withKnobs()],
};

function generateReviewItem(questionText: string): ReviewItem {
  return {
    reviewItemType: "prompt",
    promptState: null,
    prompt: {
      ...testBasicPrompt,
      question: { contents: questionText, attachments: [] },
    },
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}

export function Basic() {
  const colorKnobOffset = number("color shift", 0, {
    min: 0,
    max: colors.compositions.length - 1,
    step: 1,
    range: true,
  });

  const initialReviewItems: ReviewItem[] = Array.from(
    new Array(5).keys(),
  ).map((i) => generateReviewItem(`Question ${i + 1}`));

  const [items, setItems] = useState(initialReviewItems);
  const [colorCompositionIndex] = React.useState(
    () => new Animated.Value(items.length),
  );
  React.useEffect(
    () =>
      colorCompositionIndex.setValue(
        (items.length + colorKnobOffset) % colors.compositions.length,
      ),
    [colorKnobOffset],
  );
  const backgroundColor = colorCompositionIndex.interpolate({
    inputRange: Array.from(new Array(colors.compositions.length).keys()),
    outputRange: colors.compositions.map((c) => c.backgroundColor),
  });

  const onMark = useCallback(() => {
    setItems((tasks) => {
      Animated.timing(colorCompositionIndex, {
        toValue:
          (tasks.length - 1 + colorKnobOffset) % colors.compositions.length,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
      return tasks.slice(1);
    });
  }, [colorCompositionIndex, colorKnobOffset]);

  const colorComposition =
    colors.compositions[
      (items.length + colorKnobOffset) % colors.compositions.length
    ];

  return (
    <Animated.View
      style={{
        margin: 16,
        padding: 16,
        backgroundColor,
        height: 500,
      }}
    >
      <View style={{ flex: 1 }}>
        <ReviewArea
          items={items}
          onMark={onMark}
          schedule="aggressiveStart"
          {...colorComposition}
        />
      </View>
    </Animated.View>
  );
}
