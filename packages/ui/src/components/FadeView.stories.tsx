import { action } from "@storybook/addon-actions";

import React, { useState } from "react";
import FadeView from "./FadeView.jsx";
import { Button, View } from "react-native";

export default {
  title: "FadeView",
  component: FadeView,
};

export function Basic() {
  const initialValue = true;
  const [isVisible, setVisible] = useState(initialValue);
  return (
    <View>
      <FadeView
        isVisible={isVisible}
        durationMillis={100}
        style={{ backgroundColor: "blue" }}
        onTransitionEnd={action("transition ended")}
      >
        <View style={{ backgroundColor: "red", width: 50, height: 50 }} />
      </FadeView>
      <Button title="Toggle" onPress={() => setVisible((v) => !v)} />
    </View>
  );
}
