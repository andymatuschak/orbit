import { Platform, TextStyle } from "react-native";
import * as colors from "./colors";

const type = {
  label: {
    fontSize: 16,
    lineHeight: 1.25 * 14,
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
  };
}

const commonTypeColor = colors.ink;
const commonTypeStyles =
  Platform.OS === "web"
    ? {
        color: commonTypeColor,
        WebkitFontSmoothing: "antialiased",
        MozOsxFontSmoothing: "antialiased",
        textRendering: "optimizeLegibility",
      }
    : { color: commonTypeColor };

function makeTypeSpec(
  typeStyle: TextStyle,
  topShiftNative: number,
  topShiftWeb: number,
  bottomShift: number,
): TypeSpec {
  const typeWithCommonStyles = {
    ...commonTypeStyles,
    ...typeStyle,
  };

  const topShift = Platform.OS === "web" ? topShiftWeb : topShiftNative;

  return {
    typeStyle: typeWithCommonStyles,
    layoutStyle: {
      ...typeWithCommonStyles,
      position: "relative",
      // Unfortunately, React Native Web and React Native lay out text differently! See https://github.com/facebook/react-native/issues/29507.
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
  -3,
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
  -6,
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
  0,
  -7,
  -8,
);

export const headline = makeTypeSpec(
  {
    fontSize: 36,
    fontFamily: "Dr-Medium",
    lineHeight: 32,
    letterSpacing: 36 * 0.01,
  },
  -2,
  -7,
  -8,
);

export const body = makeTypeSpec(
  {
    fontSize: 24,
    fontFamily: "Dr-Bold",
    lineHeight: 24,
    letterSpacing: 24 * 0.01,
  },
  -4,
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
  -3,
  -4,
  -4,
);

export const label = makeTypeSpec(
  {
    fontSize: 24,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 24,
    letterSpacing: 24 * 0.01,
  },
  -4,
  -6,
  -8,
);

export const caption = makeTypeSpec(
  {
    fontSize: 12,
    fontFamily: "Dr-ExtraBold",
    lineHeight: 12,
    letterSpacing: 13 * 0.06,
  },
  -2,
  -3,
  -4,
);
