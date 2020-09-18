import { typedKeys, ColorPaletteName } from "metabook-core";

export const ink = "rgba(0,0,0,0.8)";
export const white = "rgba(255,255,255,1)";
export const productKeyColor = "#ED3749";

export interface ColorPalette {
  backgroundColor: string;
  accentColor: string;
  secondaryAccentColor: string;
  secondaryBackgroundColor: string;
  secondaryTextColor: string;
}

// Colors expressed in HSL for better interpolation.
const _palettes = {
  red: {
    backgroundColor: "hsl(0,100%,66%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(29,100%,51%)",
    secondaryBackgroundColor: "hsl(0,92%,60%)",
    secondaryTextColor: "hsl(0,100%,34%)",
  },
  orange: {
    backgroundColor: "hsl(23,95%,61%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(3,96%,58%)",
    secondaryBackgroundColor: "hsl(21,90%,57%)",
    secondaryTextColor: "hsl(20,100%,39%)",
  },
  brown: {
    backgroundColor: "hsl(38,72%,57%)",
    accentColor: "hsl(51,100%,55%)",
    secondaryAccentColor: "hsl(26,100%,51%)",
    secondaryBackgroundColor: "hsl(37,70%,51%)",
    secondaryTextColor: "hsl(37,84%,35%)",
  },
  yellow: {
    backgroundColor: "hsl(48,100%,49%)",
    accentColor: "hsl(27,98%,49%)",
    secondaryAccentColor: "hsl(1,91%,61%)",
    secondaryBackgroundColor: "hsl(45,99%,49%)",
    secondaryTextColor: "hsl(39,100%,40%)",
  },
  lime: {
    backgroundColor: "hsl(87,64%,53%)",
    accentColor: "hsl(60,93%,52%)",
    secondaryAccentColor: "hsl(155,99%,38%)",
    secondaryBackgroundColor: "hsl(88,69%,47%)",
    secondaryTextColor: "hsl(88,89%,31%)",
  },
  green: {
    backgroundColor: "hsl(120,57%,61%)",
    accentColor: "hsl(55,95%,50%)",
    secondaryAccentColor: "hsl(189,97%,44%)",
    secondaryBackgroundColor: "hsl(124,56%,54%)",
    secondaryTextColor: "hsl(124,56%,38%)",
  },
  turquoise: {
    backgroundColor: "hsl(180,65%,59%)",
    accentColor: "hsl(61,93%,48%)",
    secondaryAccentColor: "hsl(204,99%,50%)",
    secondaryBackgroundColor: "hsl(182,77%,47%)",
    secondaryTextColor: "hsl(182,95%,31%)",
  },
  cyan: {
    backgroundColor: "hsl(200,89%,68%)",
    accentColor: "hsl(72,90%,51%)",
    secondaryAccentColor: "hsl(170,84%,62%)",
    secondaryBackgroundColor: "hsl(200,85%,63%)",
    secondaryTextColor: "hsl(200,89%,40%)",
  },
  blue: {
    backgroundColor: "hsl(213,91%,71%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(176,82%,46%)",
    secondaryBackgroundColor: "hsl(213,83%,66%)",
    secondaryTextColor: "hsl(213,81%,51%)",
  },
  violet: {
    backgroundColor: "hsl(259,93%,76%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(276,95%,58%)",
    secondaryBackgroundColor: "hsl(259,88%,73%)",
    secondaryTextColor: "hsl(259,65%,53%)",
  },
  purple: {
    backgroundColor: "hsl(285,80%,69%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(312,82%,48%)",
    secondaryBackgroundColor: "hsl(285,80%,65%)",
    secondaryTextColor: "hsl(285,79%,38%)",
  },
  pink: {
    backgroundColor: "hsl(328,87%,69%)",
    accentColor: "hsl(45,100%,59%)",
    secondaryAccentColor: "hsl(288,78%,56%)",
    secondaryBackgroundColor: "hsl(329,79%,65%)",
    secondaryTextColor: "hsl(321,84%,39%)",
  },
};

export const orderedPaletteNames: ColorPaletteName[] = typedKeys(_palettes);
export const palettes: Record<ColorPaletteName, ColorPalette> = _palettes;
