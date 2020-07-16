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

export const displayLarge = {
  fontSize: 96,
  fontFamily: "Dr-Light",
  lineHeight: 84,
  letterSpacing: 96 * -0.07,
  color: colors.ink,
} as const;

export const display = {
  fontSize: 60,
  fontFamily: "Dr-Regular",
  lineHeight: 56,
  letterSpacing: 60 * -0.05,
  color: colors.ink,
} as const;

export const title = {
  fontSize: 48,
  fontFamily: "Dr-Medium",
  lineHeight: 40,
  letterSpacing: 48 * -0.03,
  color: colors.ink,
};

export const headline = {
  fontSize: 36,
  fontFamily: "Dr-Bold",
  lineHeight: 32,
  letterSpacing: 36 * -0.02,
  color: colors.ink,
};

export const body = {
  fontSize: 24,
  fontFamily: "Dr-ExtraBold",
  lineHeight: 24,
  color: colors.ink,
};

export const label = {
  fontSize: 24,
  fontFamily: "Dr-ExtraBold",
  lineHeight: 24,
  color: colors.ink,
};

export const caption = {
  fontSize: 12,
  fontFamily: "Dr-ExtraBold",
  lineHeight: 16,
  letterSpacing: 12 * 0.02,
  color: colors.ink,
};
