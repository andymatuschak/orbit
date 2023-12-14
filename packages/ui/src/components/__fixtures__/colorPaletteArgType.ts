import { InputType } from "@storybook/types";
import { colors } from "../../styles/index.js";

export const colorPaletteArgType = {
  options: colors.orderedPaletteNames,
  mapping: Object.fromEntries(
    colors.orderedPaletteNames.map((name) => [name, colors.palettes[name]]),
  ),
} satisfies InputType;
