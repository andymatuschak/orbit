import React from "react";
import { View } from "react-native";
import DebugGrid from "./DebugGrid.js";

export default {
  title: "Style/Grid",
};

export function Grid() {
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
