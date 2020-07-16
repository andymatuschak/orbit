import React from "react";
import { StyleSheet, View } from "react-native";
import { Label } from "./Text";
import { colors } from "../styles";

export interface ButtonProps {
  title: string;
  color?: string;
}

export default function Button({ title, color }: ButtonProps) {
  const textStyle = React.useMemo(
    () => ({
      color,
    }),
    [color],
  );
  return (
    <View
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Label textStyle={textStyle}>{title}</Label>
    </View>
  );
}
