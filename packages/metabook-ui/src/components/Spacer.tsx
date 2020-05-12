import React from "react";
import { spacing } from "../styles/layout";
import { View } from "react-native";

const Spacer = React.memo(function Spacer(props: {
  size: typeof spacing[keyof typeof spacing];
}) {
  return <View style={{ width: props.size, height: props.size }} />;
});
export default Spacer;
