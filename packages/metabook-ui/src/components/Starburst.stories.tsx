import { withKnobs, number } from "@storybook/addon-knobs";
import React from "react";
import { View, Text } from "react-native";
import Starburst from "./Starburst";

export default {
  title: "Starburst",
  component: Starburst,
  decorators: [withKnobs],
};

function StarburstGrid(props: { size: number }) {
  const minCount = number("Min count", 5);
  const children = Array.from(
    new Array(number("Count", number("Max count", 120) - minCount)).keys(),
  ).map((i) => {
    const strokeCount = i + minCount;
    const entries = Array.from(new Array(strokeCount)).map(() => ({
      length: Math.random(),
      color: "black",
    }));
    return (
      <View key={i}>
        <Text>{strokeCount}</Text>
        <Starburst
          size={props.size}
          entries={entries}
          thickness={number("Thickness", 4)}
        />
      </View>
    );
  });
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>{children}</View>
  );
}

export function MediumSize() {
  return <StarburstGrid size={number("Size", 300)} />;
}

export function ReviewSize() {
  return <StarburstGrid size={number("Size", 700)} />;
}
