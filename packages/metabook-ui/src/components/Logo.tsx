import React from "react";
import { Image, ImageStyle, StyleProp } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError";

export interface LogoProps {
  // This prop specifies the rough size of the logo itself. The logo is set inside an 8px (1 grid unit) bounding box on all sides, since some of the curved elements don't fit in the core size. So a size of 16 will give you an element that is actually 32px high.
  units: 2 | 3 | 4;
  style?: StyleProp<ImageStyle>;
}

export default React.memo(function Logo(props: LogoProps) {
  let asset: number;
  let width: number;
  let height: number;
  switch (props.units) {
    case 2:
      asset = require("../../assets/logo/16.png");
      width = 59;
      height = 32;
      break;

    case 3:
      asset = require("../../assets/logo/24.png");
      width = 80;
      height = 40;
      break;

    case 4:
      asset = require("../../assets/logo/32.png");
      width = 102;
      height = 48;
      break;

    default:
      throw unreachableCaseError(props.units);
  }

  return (
    <Image
      source={asset}
      style={[props.style, { width, height, margin: -8 }]}
      width={width}
      height={height}
    />
  );
});
