import { describe, expect, test } from "bun:test";
import { getMathLayout, getMathSVGSize } from "./mathLayout.js";

describe("getMathSVGSize", () => {
  test("reads MathJax ex dimensions", () => {
    expect(
      getMathSVGSize('<svg height="18.25ex" width="240.5ex"></svg>'),
    ).toEqual({ width: 240.5, height: 18.25 });
  });

  test("accepts pixel dimensions and rejects invalid SVG", () => {
    expect(getMathSVGSize('<svg width="20px" height="10px"></svg>')).toEqual({
      width: 20,
      height: 10,
    });
    expect(getMathSVGSize('<svg viewBox="0 0 20 10"></svg>')).toBeNull();
  });
});

describe("getMathLayout", () => {
  test("preserves equations which already fit", () => {
    expect(getMathLayout({ width: 240, height: 40 }, 300, 20)).toEqual({
      contentSize: { width: 240, height: 40 },
      viewportSize: { width: 240, height: 40 },
      scrollsHorizontally: false,
    });
  });

  test("scales moderate overflow to fit", () => {
    expect(getMathLayout({ width: 360, height: 48 }, 300, 20)).toEqual({
      contentSize: { width: 300, height: 40 },
      viewportSize: { width: 300, height: 40 },
      scrollsHorizontally: false,
    });
  });

  test("can substantially scale down large display math while it stays readable", () => {
    expect(getMathLayout({ width: 600, height: 60 }, 300, 40)).toEqual({
      contentSize: { width: 300, height: 30 },
      viewportSize: { width: 300, height: 30 },
      scrollsHorizontally: false,
    });
  });

  test("scrolls rather than shrinking below the readability limit", () => {
    const layout = getMathLayout({ width: 600, height: 60 }, 300, 20);
    expect(layout.contentSize.width).toBeCloseTo(420);
    expect(layout.contentSize.height).toBeCloseTo(42);
    expect(layout.viewportSize).toEqual({ width: 300, height: 42 });
    expect(layout.scrollsHorizontally).toBe(true);
  });
});
