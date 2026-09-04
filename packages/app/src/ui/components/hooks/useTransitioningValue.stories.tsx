import type { Meta, StoryObj } from "@storybook/react-webpack5";
import React, { useState } from "react";
import { Animated, Easing } from "react-native";
import { colors } from "../../styles/index.js";
import Button from "../Button.jsx";
import { useTransitioningColorValue } from "./useTransitioningValue.js";

const meta = {
  title: "useTransitioningValue",
} satisfies Meta<typeof ColorTestStory>;
export default meta;

type Story = StoryObj<typeof ColorTestStory>;

function ColorTestStory() {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const backgroundColor = useTransitioningColorValue({
    value:
      colors.palettes[
        colors.orderedPaletteNames[
          paletteIndex % colors.orderedPaletteNames.length
        ]
      ].backgroundColor,
    timing: {
      type: "timing",
      duration: 150,
      easing: Easing.linear,
      useNativeDriver: false,
    },
  });

  return (
    <Animated.View
      style={{
        backgroundColor,
        height: 300,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Button
        title="Change color"
        color={colors.white}
        onPress={() => setPaletteIndex((i) => i + 5)}
      />
    </Animated.View>
  );
}

export const ColorTest = {
  render: ColorTestStory,
} satisfies Story;
