function softLight(topInteger: number, bottomInteger: number) {
  const top = topInteger / 255.0;
  const bottom = bottomInteger / 255.0;
  const unitOutput = (1 - 2 * top) * bottom * bottom + 2 * top * bottom; // Pegtop's soft light blend mode: http://www.pegtop.net/delphi/articles/blendmodes/softlight.htm
  return unitOutput * 255;
}

const tertiaryAlpha = 0.8;

export const backgroundGray = "#eeeeee";
export const shadowColor = "rgba(0, 0, 0, 0.05)";
export const textColor = "#243b53";
export const key00 = "#FCFAFF";
export const key10 = "#F5EBFF";
export const key20 = "#DABAFF";
export const key30 = "#BE8FFF";
export const key40 = "#A15EFF";
export const key50 = "#8B3AFC";
export const key60 = "#6E2BCC";
export const key70 = "#490F99";
export const key80 = "#2E0A63";
export const key90 = "#23133D";
export const bg = [
  "rgba(237,55,73,1)",
  "rgba(230,93,2,1)",
  "rgba(211,149,66,1)",
  "rgba(214,178,24,1)",
  "rgba(198,193,18,1)",
  "rgba(74,186,74,1)",
  "rgba(71,197,214,1)",
  "rgba(46,134,229,1)",
  "rgba(108,108,229,1)",
  "rgba(134,112,224,1)",
  "rgba(205,65,229,1)",
  "rgba(216,42,167,1)",
];
export const fg = [
  "rgba(255,41,92,1)",
  "rgba(255,135,46,1)",
  "rgba(249,166,0,1)",
  "rgba(226,220,0,1)",
  "rgba(192,226,27,1)",
  "rgba(76,221,0,1)",
  "rgba(92,229,225,1)",
  "rgba(44,170,255,1)",
  "rgba(128,128,255,1)",
  "rgba(154,102,255,1)",
  "rgba(232,23,255,1)",
  "rgba(249,0,214,1)",
];
export const tertiary = [
  `rgba(${softLight(255, 237)}, ${softLight(41, 55)}, ${softLight(
    92,
    73,
  )}, 1.0)`,
  `rgba(${softLight(255, 230)}, ${softLight(135, 93)}, ${softLight(
    46,
    2,
  )}, 0.9)`,
  `rgba(${softLight(249, 211)}, ${softLight(166, 149)}, ${softLight(
    0,
    66,
  )}, 1.0)`,
  `rgba(${softLight(226, 214)}, ${softLight(220, 178)}, ${softLight(
    0,
    24,
  )}, 0.7)`,
  `rgba(${softLight(192, 198)}, ${softLight(226, 193)}, ${softLight(
    27,
    18,
  )}, 0.5)`,
  `rgba(${softLight(76, 74)}, ${softLight(221, 186)}, ${softLight(
    0,
    74,
  )}, 0.5)`,
  `rgba(${softLight(92, 71)}, ${softLight(229, 197)}, ${softLight(
    225,
    214,
  )}, 0.6)`,
  `rgba(${softLight(44, 46)}, ${softLight(170, 134)}, ${softLight(
    255,
    229,
  )}, ${tertiaryAlpha})`,
  `rgba(${softLight(128, 108)}, ${softLight(128, 108)}, ${softLight(
    255,
    229,
  )}, 0.8)`,
  `rgba(${softLight(255, 134)}, ${softLight(255, 112)}, ${softLight(
    255,
    224,
  )}, 0.3)`,
  `rgba(${softLight(232, 205)}, ${softLight(23, 65)}, ${softLight(
    255,
    229,
  )}, 0.9)`,
  `rgba(${softLight(249, 216)}, ${softLight(0, 42)}, ${softLight(
    214,
    167,
  )}, 0.7)`,
];

export const ink = "rgba(0,0,0,0.8)";
export const white = "rgba(255,255,255,1)";

interface ColorComposition {
  backgroundColor: string;
  accentColor: string;
  secondaryColor: string;
  tertiaryColor: string;
}
export const compositions: ColorComposition[] = [
  {
    backgroundColor: bg[0],
    accentColor: fg[3],
    secondaryColor: bg[3],
    tertiaryColor: fg[0],
  },
  {
    backgroundColor: bg[1],
    accentColor: fg[7],
    secondaryColor: bg[3],
    tertiaryColor: tertiary[1],
  },
  {
    backgroundColor: bg[2],
    accentColor: fg[8],
    secondaryColor: bg[1],
    tertiaryColor: fg[2],
  },
  {
    backgroundColor: bg[3],
    accentColor: fg[9],
    secondaryColor: bg[1],
    tertiaryColor: tertiary[3],
  },
  {
    backgroundColor: bg[4],
    accentColor: fg[9],
    secondaryColor: bg[1],
    tertiaryColor: tertiary[4],
  },
  {
    backgroundColor: bg[5],
    accentColor: fg[3],
    secondaryColor: bg[3],
    tertiaryColor: tertiary[5],
  },
  {
    backgroundColor: bg[6],
    accentColor: fg[3],
    secondaryColor: bg[7],
    tertiaryColor: tertiary[6],
  },
  {
    backgroundColor: bg[7],
    accentColor: fg[3],
    secondaryColor: bg[5],
    tertiaryColor: tertiary[7],
  },
  {
    backgroundColor: bg[8],
    accentColor: fg[3],
    secondaryColor: bg[6],
    tertiaryColor: fg[8],
  },
  {
    backgroundColor: bg[9],
    accentColor: fg[3],
    secondaryColor: bg[6],
    tertiaryColor: tertiary[9],
  },
  {
    backgroundColor: bg[10],
    accentColor: fg[4],
    secondaryColor: bg[8],
    tertiaryColor: tertiary[10],
  },
  {
    backgroundColor: bg[11],
    accentColor: fg[4],
    secondaryColor: bg[1],
    tertiaryColor: tertiary[11],
  },
];
