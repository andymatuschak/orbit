import React from "react";
import Svg, { Path, Pattern, Rect } from "react-native-svg";

type SawtoothPatternProps = {
  color: string;
  strokeColor?: string;
  teethHeight: number;
  teethWidth: number;
}

export function SawtoothPattern({ color, teethWidth, teethHeight, strokeColor }: SawtoothPatternProps) {
  return (
    <Svg width="100%" height={teethHeight}>
      <Pattern id="sawtooth-pattern" patternUnits="userSpaceOnUse" width={teethWidth} height={teethHeight}>
        <Path 
          fill={color}
          d={`M0 ${teethHeight} L${teethWidth/2} 0 L${teethWidth} ${teethHeight}`}
          stroke={strokeColor}
          strokeWidth={2}
        />
      </Pattern>
      <Rect width="100%" height="100%" fill="url(#sawtooth-pattern)" />
    </Svg>
  )
}