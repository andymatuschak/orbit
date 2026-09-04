import type { Meta, StoryObj } from "@storybook/react-webpack5";
import { fn } from "storybook/test";

import React, { useState } from "react";
import FadeView from "./FadeView.jsx";
import { Button, View } from "react-native";

const meta = {
  title: "FadeView",
  component: FadeView,
} satisfies Meta<typeof FadeView>;
export default meta;

type Story = StoryObj<typeof BasicStory>;

function BasicStory({
  onTransitionEnd,
}: {
  onTransitionEnd: (toVisible: boolean, didFinish: boolean) => void;
}) {
  const initialValue = true;
  const [isVisible, setVisible] = useState(initialValue);
  return (
    <View>
      <FadeView
        isVisible={isVisible}
        durationMillis={100}
        style={{ backgroundColor: "blue" }}
        onTransitionEnd={onTransitionEnd}
      >
        <View style={{ backgroundColor: "red", width: 50, height: 50 }} />
      </FadeView>
      <Button title="Toggle" onPress={() => setVisible((v) => !v)} />
    </View>
  );
}

export const Basic = {
  args: { onTransitionEnd: fn() },
  render: BasicStory,
} satisfies Story;
