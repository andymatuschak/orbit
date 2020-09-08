import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError";

export interface LogoProps {
  // This prop specifies the rough size of the logo itself. The logo is set inside an 8px (1 grid unit) bounding box on all sides, since some of the curved elements don't fit in the core size. So a size of 16 will give you an element that is actually 32px high.
  size: 16;
  style?: StyleProp<ImageStyle>;
}

export default React.memo(function Logo(props: LogoProps) {
  let asset: number;
  let width: number;
  let height: number;
  switch (props.size) {
    case 16:
      asset = require("../../assets/logo/16.png");
      width = 59;
      height = 32;
      break;
    default:
      throw unreachableCaseError(props.size);
  }

  return (
    <Image
      source={asset}
      style={[props.style, { width, height }]}
      width={width}
      height={height}
    />
  );
});
