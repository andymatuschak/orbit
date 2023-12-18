import { ImageStyle, StyleProp } from "react-native";

export enum IconName {
  Check = "check",
  Cross = "cross",
  Reveal = "reveal",
  ArrowLeft = "left",
  ArrowRight = "right",
  DoubleArrowRight = "doubleArrowRight",
  List = "list",
  Menu = "menu",
}

export enum IconPosition {
  TopLeft = "TL",
  TopRight = "TR",
  BottomLeft = "BL",
  BottomRight = "BR",
  Center = "Center",
}

export interface IconProps {
  name: IconName;
  position: IconPosition;
  tintColor: string;
  style?: StyleProp<ImageStyle>;
  accentColor?: string;
}

export const iconSize = 24;
