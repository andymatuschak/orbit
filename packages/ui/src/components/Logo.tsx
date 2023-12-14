import React from "react";
import { Image } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError.js";
import { getLogoSize, LogoProps } from "./LogoShared.js";

function getLogoAsset(units: LogoProps["units"]): number {
  switch (units) {
    case 2:
      return require("../../assets/logo/16.png");
    case 3:
      return require("../../assets/logo/24.png");
    case 4:
      return require("../../assets/logo/32.png");
    default:
      throw unreachableCaseError(units);
  }
}

export default React.memo(function Logo(props: LogoProps) {
  const { width, height } = getLogoSize(props.units);
  return (
    <Image
      source={getLogoAsset(props.units)}
      style={{ width, height, margin: -8 }}
    />
  );
});
