import React from "react";
import { View, Text } from "react-native";
import Starburst from "./Starburst";

export default {
  title: "Starburst",
  component: Starburst,
};

function StarburstGrid(props: { size: number }) {
  const children = Array.from(new Array(120).keys()).map((i) => {
    const strokeCount = i + 5;
    const values = Array.from(new Array(strokeCount)).map(() => Math.random());
    return (
      <View key={i}>
        <Text>{strokeCount}</Text>
        <Starburst
          size={props.size}
          lengths={values}
          thickness={4}
          color="black"
        />
      </View>
    );
  });
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>{children}</View>
  );
}

export function MediumSize() {
  return <StarburstGrid size={300} />;
}

export function ReviewSize() {
  return <StarburstGrid size={700} />;
}
