import React from "react";
import { Image, ImageRequireSource } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError.js";
import { getLogoSize, LogoProps } from "./LogoShared.js";

function getLogoAsset(units: LogoProps["units"]): ImageRequireSource {
  switch (units) {
    case 2:
      return require("../../assets/logo/16.svg");
    case 3:
      return require("../../assets/logo/24.svg");
    case 4:
      return require("../../assets/logo/32.svg");
    default:
      throw unreachableCaseError(units);
  }
}

export default React.memo(function Logo(props: LogoProps) {
  const { width, height } = getLogoSize(props.units);
  return (
    <Image
      source={getLogoAsset(props.units)}
      tintColor={props.tintColor}
      style={{ width, height, margin: -8 }}
    />
  );
});
