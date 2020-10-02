import { StyleProp, ViewStyle } from "react-native";

export enum IconName {
  Check = "check",
  Cross = "cross",
  Reveal = "reveal",
  ArrowRight = "right",
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
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
}

export const iconSize = 24;
