import { testBasicPrompt } from "metabook-sample-data";
import React, { useCallback, useState, useMemo } from "react";
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

  const items: ReviewItem[] = useMemo(
    () =>
      Array.from(new Array(25).keys()).map((i) =>
        generateReviewItem(`Question ${i + 1}`),
      ),
    [],
  );

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [colorCompositionIndex] = React.useState(
    () => new Animated.Value(items.length),
  );
  React.useEffect(
    () =>
      colorCompositionIndex.setValue(
        (currentItemIndex + colorKnobOffset) % colors.compositions.length,
      ),
    [colorKnobOffset],
  );
  const backgroundColor = colorCompositionIndex.interpolate({
    inputRange: Array.from(new Array(colors.compositions.length).keys()),
    outputRange: colors.compositions.map((c) => c.backgroundColor),
  });

  const onMark = useCallback(() => {
    setCurrentItemIndex((currentItemIndex) => {
      Animated.timing(colorCompositionIndex, {
        toValue:
          (currentItemIndex + 1 + colorKnobOffset) % colors.compositions.length,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start();
      return currentItemIndex + 1;
    });
  }, [colorCompositionIndex, colorKnobOffset]);

  const colorComposition =
    colors.compositions[
      (currentItemIndex + colorKnobOffset) % colors.compositions.length
    ];

  return (
    <Animated.View
      style={{
        margin: 16,
        backgroundColor,
        height: 500,
      }}
    >
      <View style={{ flex: 1 }}>
        <ReviewArea
          items={items}
          onMark={onMark}
          schedule="aggressiveStart"
          currentItemIndex={currentItemIndex}
          {...colorComposition}
        />
      </View>
    </Animated.View>
  );
}
