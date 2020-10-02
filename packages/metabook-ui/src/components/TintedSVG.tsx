// On mobile, we use PNGs with multiple rasterizations (@2x, @3x) and platform tint color features to draw our graphic elements. But on web, we run into two react-native-web limitations: no one's yet built bundler support for multi-resolution assets; and the RNW approach to tintColor (using SVG filters) fails on Safari, rendering black--likely due to a Safari bug. So we use SVGs on web.

import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

export interface TintedSVGProps {
  source: string;
  width: number;
  height: number;
  tintColor: string;
  style?: StyleProp<ViewStyle>;
}

export default function TintedSVG({
  source,
  width,
  height,
  tintColor,
  style,
}: TintedSVGProps) {
  return (
    <View
      style={[
        {
          width,
          height,
          backgroundColor: tintColor,
          // @ts-ignore
          maskImage: `url(${source})`,
          maskSize: "cover",
        },
        style,
      ]}
    />
  );
}
