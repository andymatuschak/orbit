import React from "react";
import { View } from "react-native";
import { gridUnit } from "../styles/layout.js";

export interface SpacerProps {
  units: number;
}

const Spacer = React.memo(function Spacer(props: SpacerProps) {
  const size = props.units * gridUnit;
  return <View style={{ width: size, height: size }} />;
});
export default Spacer;
