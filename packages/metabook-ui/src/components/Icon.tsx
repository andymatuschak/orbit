import React from "react";
import { Image, ImageStyle, StyleProp, StyleSheet } from "react-native";

export enum IconName {
  Check = "check",
}

export enum IconPosition {
  TopLeft = "TL",
  TopRight = "TR",
  BottomLeft = "BL",
  BottomRight = "BR",
}

export interface IconProps {
  name: IconName;
  position: IconPosition;
  style?: StyleProp<ImageStyle>;
}

export default function Icon(props: IconProps) {
  return (
    <Image
      source={require(`../assets/icons/${props.name} ${props.position}.png`)}
      style={StyleSheet.compose(props.style, { width: 24, height: 24 })}
    />
  );
}
