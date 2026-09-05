export interface MathSize {
  width: number;
  height: number;
}

export interface MathLayout {
  contentSize: MathSize;
  viewportSize: MathSize;
  scrollsHorizontally: boolean;
}

// Past this point, preserving legibility is more useful than fitting every
// glyph into the initial viewport.
const minimumReadableFontSize = 14;

function readSVGDimension(
  svg: string,
  attribute: "width" | "height",
): number | null {
  const match = svg.match(
    new RegExp(`\\b${attribute}="([\\d.]+)(?:ex|px)"`, "i"),
  );
  const value = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getMathSVGSize(svg: string): MathSize | null {
  const width = readSVGDimension(svg, "width");
  const height = readSVGDimension(svg, "height");
  return width !== null && height !== null ? { width, height } : null;
}

export function getMathLayout(
  intrinsicSize: MathSize,
  maximumWidth: number | undefined,
  preferredFontSize: number,
): MathLayout {
  if (
    !maximumWidth ||
    maximumWidth <= 0 ||
    intrinsicSize.width <= maximumWidth
  ) {
    return {
      contentSize: intrinsicSize,
      viewportSize: intrinsicSize,
      scrollsHorizontally: false,
    };
  }

  const readableScale = Math.min(
    1,
    preferredFontSize > 0 ? minimumReadableFontSize / preferredFontSize : 1,
  );
  const scaleToFit = maximumWidth / intrinsicSize.width;
  const scrollsHorizontally = scaleToFit < readableScale;
  const scale = scrollsHorizontally ? readableScale : scaleToFit;
  const contentSize = {
    width: intrinsicSize.width * scale,
    height: intrinsicSize.height * scale,
  };

  return {
    contentSize,
    viewportSize: {
      width: scrollsHorizontally ? maximumWidth : contentSize.width,
      height: contentSize.height,
    },
    scrollsHorizontally,
  };
}
