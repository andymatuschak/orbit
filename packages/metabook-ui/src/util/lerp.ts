function clip(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}

export default function lerp(
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
