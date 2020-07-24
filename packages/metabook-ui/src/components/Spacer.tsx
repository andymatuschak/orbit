import React from "react";
import { View } from "react-native";
import { gridUnit } from "../styles/layout";

const Spacer = React.memo(function Spacer(props: { units: number }) {
  const size = props.units * gridUnit;
  return <View style={{ width: size, height: size }} />;
});
export default Spacer;
