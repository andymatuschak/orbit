import React from "react";
import {
  ColorValue,
  FlexStyle,
  Image,
  ImageStyle,
  StyleProp,
} from "react-native";

export enum IconName {
  Check = "check",
  Cross = "cross",
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
  style?: StyleProp<FlexStyle>;
  tintColor?: ColorValue;
}

export default React.memo(function Icon(props: IconProps) {
  const { tintColor, style, position, name } = props;
  return (
    <Image
      source={require(`../assets/icons/${name} ${position}.png`)}
      style={[
        { width: 24, height: 24 },
        !!tintColor && { tintColor: tintColor },
        style as StyleProp<ImageStyle>,
      ]}
    />
  );
});
