import React from "react";
import unreachableCaseError from "../util/unreachableCaseError";
import { getLogoSize, LogoProps } from "./LogoShared";
import TintedSVG from "./TintedSVG";

function getLogoAsset(units: LogoProps["units"]): string {
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
    <TintedSVG
      source={getLogoAsset(props.units)}
      width={width}
      height={height}
      tintColor={props.tintColor}
      style={{ margin: -8 }}
    />
  );
});
