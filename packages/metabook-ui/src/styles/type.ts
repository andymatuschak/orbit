import { TextStyle } from "react-native";
import colors from "./colors";

const type = {
  label: {
    fontSize: 16,
    lineHeight: 1.25 * 14,
  },

  cardBodyText: {
    fontSize: 16,
    lineHeight: 1.4 * 16,
    color: colors.textColor,
  },

  smallCardBodyText: {
    fontSize: 15,
    lineHeight: 1.45 * 15,
    color: colors.textColor,
  },

  smallestCardBodyText: {
    fontSize: 13,
    lineHeight: 1.35 * 13,
    color: colors.textColor,
  },
} as const;
export default type;

interface TypeSpec {
  typeStyle: TextStyle;
  layoutStyle: TextStyle; // includes position shifts to place text on the baseline grid, compensating for the silly baseline-ignoring layout that the web (and hence RN) do. These components position the baselines on a baseline, and they don't add any extra padding below.
}

const boldFontNameTable: { [key: string]: string } = {
  "Dr-Light": "Dr-Regular",
  "Dr-Regular": "Dr-Bold",
  "Dr-Medium": "Dr-ExtraBold",
  "Dr-Bold": "Dr-ExtraBold",
  "Dr-ExtraBold": "Dr-ExtraBold",
};

export function getVariantStyles(
  baseFontName: string,
  isBold: boolean,
  isItalic: boolean,
): Partial<TextStyle> {
  let workingFontName = isBold ? boldFontNameTable[baseFontName] : baseFontName;
  if (!workingFontName) {
    throw new Error(`Unknown font name ${baseFontName}`);
  }

  if (isItalic) {
    if (workingFontName === "Dr-Regular") {
      workingFontName = "Dr-Italic";
    } else {
      workingFontName += "Italic";
    }
  }

  return {
    fontFamily: workingFontName,
    // When we can't bold any further, use a darker ink.
    // TODO: consider using an accent color instead
    ...(baseFontName.includes("Bold") && isBold && { color: "black" }),
    // We're (ab)using the font family to specify a specific font, rather than a family (RN uses fontFamily to find a specific PostScript name), so we must un-set the special styles.
    fontWeight: "normal",
    fontStyle: "normal",
  };
}

function makeTypeSpec(
  typeStyle: TextStyle,
  topShift: number,
  bottomShift: number,
): TypeSpec {
  const typeWithCommonStyles = {
    color: colors.ink,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "antialiased",
    textRendering: "optimizeLegibility",
    ...typeStyle,
  };
  return {
    typeStyle: typeWithCommonStyles,
    layoutStyle: {
      ...typeWithCommonStyles,
      position: "relative",
      top: topShift,
      marginBottom: bottomShift,
    },
  };
}

export const displayLarge = makeTypeSpec(
  {
    fontSize: 96,
    fontFamily: "Dr-Light",
    lineHeight: 84,
    letterSpacing: 96 * -0.05,
  },
  -17,
  -20,
);

export const display = makeTypeSpec(
  {
    fontSize: 60,
    fontFamily: "Dr-Regular",
    lineHeight: 56,
    letterSpacing: 60 * -0.035,
  },
  -12,
  -16,
);

export const title = makeTypeSpec(
  {
    fontSize: 48,
    fontFamily: "Dr-Medium",
    lineHeight: 40,
    letterSpacing: 48 * -0.015,
  },
  -7,
  -8,
);

export const headline = makeTypeSpec(
  {
    fontSize: 36,
    fontFamily: "Dr-Bold",
    lineHeight: 32,
    // letterSpacing: 36 * 0,
  },
  -7,
  -8,
);

export const body = makeTypeSpec(
  {
    fontSize: 24,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 24,
    letterSpacing: 24 * 0.01,
  },
  -6,
  -8,
);

export const bodySmall = makeTypeSpec(
  {
    fontSize: 16,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 16,
    letterSpacing: 16 * 0.04,
  },
  -4,
  -4,
);

export const label = makeTypeSpec(
  {
    fontSize: 24,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 24,
    // letterSpacing: 24 * 0.0,
  },
  -6,
  -8,
);

export const caption = makeTypeSpec(
  {
    fontSize: 12,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 16,
    letterSpacing: 13 * 0.05,
  },
  -5,
  -8,
);
