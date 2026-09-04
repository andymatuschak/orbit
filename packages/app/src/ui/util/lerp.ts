import clamp from "./clamp.js";

export default function lerp(
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number,
) {
  const output =
    ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin;
  return clamp(output, toMin, toMax);
}
