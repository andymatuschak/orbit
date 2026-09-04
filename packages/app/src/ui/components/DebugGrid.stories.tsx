import type { Meta, StoryObj } from "@storybook/react-webpack5";
import React from "react";
import { View } from "react-native";
import DebugGrid from "./DebugGrid.js";

const meta = {
  title: "Style/Grid",
} satisfies Meta<typeof GridStory>;
export default meta;

type Story = StoryObj<typeof GridStory>;

function GridStory() {
  return (
    <View
      style={{
        position: "relative",
        marginTop: 32,
        marginLeft: 32,
        width: 375,
        height: 700,
        borderWidth: 1,
        borderColor: "black",
      }}
    >
      <DebugGrid />
    </View>
  );
}

export const Grid = {
  render: GridStory,
} satisfies Story;
