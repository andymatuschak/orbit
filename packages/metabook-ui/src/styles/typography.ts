import colors from "./colors";

const typography = {
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
export default typography;
