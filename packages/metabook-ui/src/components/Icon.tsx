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

function getIconAsset(name: IconName, iconPosition: IconPosition): number {
  switch (name) {
    case IconName.Check:
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../src/assets/icons/check TL.png");
        case IconPosition.TopRight:
          return require("../../src/assets/icons/check TR.png");
        case IconPosition.BottomLeft:
          return require("../../src/assets/icons/check BL.png");
        case IconPosition.BottomRight:
          return require("../../src/assets/icons/check BR.png");
      }
    case IconName.Cross:
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../src/assets/icons/cross TL.png");
        case IconPosition.TopRight:
          return require("../../src/assets/icons/cross TR.png");
        case IconPosition.BottomLeft:
          return require("../../src/assets/icons/cross BL.png");
        case IconPosition.BottomRight:
          return require("../../src/assets/icons/cross BR.png");
      }
  }
}

export default React.memo(function Icon(props: IconProps) {
  const { tintColor, style, position, name } = props;
  return (
    <Image
      source={getIconAsset(name, position)}
      style={[
        { width: 24, height: 24 },
        !!tintColor && { tintColor: tintColor },
        style as StyleProp<ImageStyle>,
      ]}
    />
  );
});
