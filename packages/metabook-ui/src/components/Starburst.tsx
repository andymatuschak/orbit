import React from "react";
import Svg, { G, Line, Path } from "react-native-svg";

export interface StarburstProps {
  size: number;
  lengths: number[];
  thickness: number;
  color: string;
}

function clip(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

function lerp(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
) {
  const output =
    ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
  return clip(output, toMin, toMax);
}

const innerRadiusSpacing = 1.2; // The space between spokes at their tapered points.
const outerRadiusSpacing = 1.0; // The tightest margin between spokes at their thickest points.

const quillPath =
  "M0.875 0.10825C0.5835 0.18575 0.29175 0.293 0 0.5C0.29175 0.707 0.5835 0.81425 0.875 0.89175C1.16675 0.965 1.45825 0.99925 1.75 1V0C1.45825 0.000750005 1.16675 0.035 0.875 0.10825Z";
// const quillPath = "M0 0.5L1.75 0V1";
const quillPathLength = 1.75;
const quillPathWidth = 1.0;

export default function Starburst({
  lengths,
  size,
  thickness,
  color,
}: StarburstProps) {
  const segmentSin = Math.sin((2 * Math.PI) / lengths.length);
  const innerRadius = (innerRadiusSpacing * 2.0) / size / segmentSin;
  const outerRadius =
    (thickness + outerRadiusSpacing * 2.0) / size / segmentSin;
  const unitThickness = thickness / size;
  // const innerRadius = lerp(lengths.length, 8, 120, 0.015, 0.1);
  return (
    <Svg height={size} width={size} viewBox="0 0 1 1">
      {lengths.map((length, index) => {
        const theta = (index / lengths.length) * 2 * Math.PI;
        const unitX = Math.cos(theta);
        const unitY = -1 * Math.sin(theta);
        const strokeRadius = lerp(length, 0, 1, outerRadius, 0.5);
        return (
          <>
            <G
              transform={`rotate(${
                (theta * 180) / Math.PI
              }, 0.5, 0.5) translate(${
                0.5 + innerRadius + (outerRadius - innerRadius) / 2.0
              }, 0.5) scale(${(outerRadius - innerRadius) / quillPathLength} ${
                unitThickness / quillPathWidth
              }) translate(${-quillPathLength / 2.0}, ${
                -quillPathWidth / 2.0
              })`}
            >
              <Path d={quillPath} fill={color} />
            </G>
            <Line
              key={index + 1000}
              x1={0.5 + outerRadius * unitX}
              x2={0.5 + strokeRadius * unitX}
              y1={0.5 + outerRadius * unitY}
              y2={0.5 + strokeRadius * unitY}
              strokeWidth={unitThickness}
              stroke={color}
            />
          </>
        );
      })}
    </Svg>
  );
}
