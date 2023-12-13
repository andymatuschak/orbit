import { boolean, number } from "@storybook/addon-knobs";
import React from "react";
import { View, Text } from "react-native";
import { Svg, Circle, Text as SVGText } from "react-native-svg";
import Button from "../components/Button.jsx";
import { IconName } from "../components/IconShared.js";
import Spacer from "../components/Spacer.jsx";
import Starburst from "../components/Starburst.jsx";
import * as layout from "./layout.js";
import * as type from "./type.js";
import * as colors from "./colors.js";

type RGBA = [number, number, number, number];

/**
 * https://gist.github.com/mjackson/5311256
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 255].
 *
 * @param   Number  h       The hue
 * @param   Number  s       The saturation
 * @param   Number  l       The lightness
 * @return  Array           The RGB representation
 */
function hslToRgb(h: number, s: number, l: number) {
  let r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    function hue2rgb(p: number, q: number, t: number) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r * 255, g * 255, b * 255];
}

function extractRGBA(rgbaString: string): RGBA | null {
  if (rgbaString.startsWith("#")) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(rgbaString);
    return (
      match && [
        parseInt(match[1], 16) / 255.0,
        parseInt(match[2], 16) / 255.0,
        parseInt(match[3], 16) / 255.0,
        1,
      ]
    );
  } else if (rgbaString.startsWith("hsl")) {
    const match = /hsla?\((\d+),\s*(\d+)%,\s*(\d+)%,?\s*([0-9.]+)?\)/.exec(
      rgbaString,
    );
    if (match) {
      const rgb = hslToRgb(
        Number.parseInt(match[1]) / 360.0,
        Number.parseInt(match[2]) / 100.0,
        Number.parseInt(match[3]) / 100.0,
      );
      return [
        rgb[0] / 255.0,
        rgb[1] / 255.0,
        rgb[2] / 255.0,
        Number.parseFloat(match[4] ?? "1.0"),
      ];
    } else {
      return null;
    }
  } else if (rgbaString.startsWith("rgba")) {
    const match = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/.exec(
      rgbaString,
    );
    return (
      match && [
        Number.parseInt(match[1]) / 255.0,
        Number.parseInt(match[2]) / 255.0,
        Number.parseInt(match[3]) / 255.0,
        Number.parseFloat(match[4]),
      ]
    );
  } else {
    return null;
  }
}

function getLuminance(rgb: RGBA): number {
  function getFactor(v: number): number {
    return v < 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  return (
    0.2126 * getFactor(rgb[0]) +
    0.7152 * getFactor(rgb[1]) +
    0.0722 * getFactor(rgb[2])
  );
}

function getContrastRatio(a: RGBA, b: RGBA): number {
  if (a[3] !== 1 || b[3] !== 1) {
    throw new Error(
      `Can't compute contrast ratio for transparent RGBA: ${a} vs ${b}`,
    );
  }

  const aL = getLuminance(a);
  const bL = getLuminance(b);
  const lighter = Math.max(aL, bL);
  const darker = Math.min(aL, bL);
  return (lighter + 0.05) / (darker + 0.05);
}

function sourceOver(dest: RGBA, src: RGBA): RGBA {
  const srcAlpha = src[3];
  const destAlpha = dest[3];
  const outAlpha = srcAlpha + destAlpha * (1 - srcAlpha);
  function mix(
    dest: number,
    src: number,
    destAlpha: number,
    srcAlpha: number,
  ): number {
    return (src * srcAlpha + dest * destAlpha * (1 - srcAlpha)) / outAlpha;
  }
  return [
    mix(dest[0], src[0], destAlpha, srcAlpha),
    mix(dest[1], src[1], destAlpha, srcAlpha),
    mix(dest[2], src[2], destAlpha, srcAlpha),
    outAlpha,
  ];
}

export default {
  title: "Style/Colors",
};

const swatchRadius = 96;
function ColorSwatch({
  backgroundColor,
  foregroundColor1,
  foregroundColor2,
  cx,
  cy,
}: {
  backgroundColor: string;
  foregroundColor1: string;
  foregroundColor2: string;
  cx: number;
  cy: number;
}) {
  const rgba = extractRGBA(backgroundColor)!;
  const composited1 = sourceOver(rgba, extractRGBA(foregroundColor1)!);
  const composited2 = sourceOver(rgba, extractRGBA(foregroundColor2)!);
  const contrastRatio1 = getContrastRatio(composited1, rgba);
  const contrastRatio2 = getContrastRatio(composited2, rgba);
  const showContrast = boolean("Show contrast", true);
  return (
    <>
      <Circle cx={cx} cy={cy} r={swatchRadius / 2} fill={backgroundColor} />
      {showContrast && (
        <SVGText
          textAnchor="middle"
          fill={foregroundColor1}
          x={cx}
          y={cy - type.label.typeStyle.lineHeight! / 4}
          fontFamily={type.label.typeStyle.fontFamily}
          fontSize={type.label.typeStyle.fontSize}
        >
          {contrastRatio1.toFixed(1)}
        </SVGText>
      )}
      {showContrast && (
        <SVGText
          textAnchor="middle"
          fill={foregroundColor2}
          x={cx}
          y={cy + type.label.typeStyle.lineHeight!}
          fontFamily={type.label.typeStyle.fontFamily}
          fontSize={type.label.typeStyle.fontSize}
        >
          {contrastRatio2.toFixed(1)}
        </SVGText>
      )}
    </>
  );
}

export function Palette() {
  const colorCount = colors.orderedPaletteNames.length;
  return (
    <View style={{ backgroundColor: "#999" }}>
      <Svg
        width={swatchRadius * 7}
        height={swatchRadius * 7}
        viewBox={`${-swatchRadius * 3.5} ${-swatchRadius * 3.5} ${
          swatchRadius * 7
        } ${swatchRadius * 7}`}
      >
        {Array.from(new Array(colorCount).keys()).map((i) => {
          const theta = (i / colorCount) * 2 * Math.PI - Math.PI / 2;
          const palette = colors.palettes[colors.orderedPaletteNames[i]];
          return (
            <>
              <ColorSwatch
                key={`${i}-bg`}
                cx={swatchRadius * 2 * Math.cos(theta)}
                cy={swatchRadius * 2 * Math.sin(theta)}
                backgroundColor={palette.backgroundColor}
                foregroundColor1={colors.ink}
                foregroundColor2={palette.accentColor}
              />
              <ColorSwatch
                key={`${i}-shade`}
                cx={swatchRadius * 3 * Math.cos(theta)}
                cy={swatchRadius * 3 * Math.sin(theta)}
                backgroundColor={palette.secondaryBackgroundColor}
                foregroundColor1={colors.white}
                foregroundColor2={palette.accentColor}
              />
            </>
          );
        })}
      </Svg>
    </View>
  );
}

const starburstValues = [
  0.2, 1.0, 0.3, 0.6, 0.2, 0.7, 0.2, 0.4, 0.1, 0.7, 0.2, 0.6, 0.4, 0.2, 1.0,
  0.3, 0.6, 0.2, 0.7, 0.2, 0.4, 0.1, 0.7, 0.2, 0.6, 0.4,
];

function CompositionTest({
  colorPalette: {
    backgroundColor,
    accentColor,
    secondaryAccentColor,
    secondaryBackgroundColor,
    secondaryTextColor,
  },
}: {
  colorPalette: colors.ColorPalette;
}) {
  const width = 375;

  const numberComplete = number("number complete", 5);
  return (
    <View
      style={{
        backgroundColor,
        width: width,
        height: 500,
        marginLeft: 32,
        marginTop: 32,
        paddingLeft: layout.gridUnit * 2,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          position: "absolute",
          left: -width + layout.gridUnit * 2,
          top: -width + layout.gridUnit * 6,
        }}
      >
        <Starburst
          diameter={width * 2}
          entries={starburstValues.map((value, i) => {
            return {
              color:
                i < numberComplete
                  ? secondaryAccentColor
                  : secondaryBackgroundColor,
              value,
            };
          })}
          thickness={3}
          entryAtHorizontal={numberComplete}
          accentOverlayColor={accentColor}
        />
      </View>
      <View
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 7,
        }}
      >
        <Text style={type.labelTiny.layoutStyle}>5d</Text>
      </View>

      <View
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 18,
        }}
      >
        <Text style={[type.promptMedium.layoutStyle, { color: accentColor }]}>
          Source context
        </Text>
      </View>
      <Text style={type.promptLarge.layoutStyle}>Primary content</Text>
      <View style={{ position: "absolute", bottom: 24 }}>
        <Text
          style={[type.labelTiny.layoutStyle, { color: secondaryTextColor }]}
        >
          Secondary text
        </Text>
        <Spacer units={2} />
        <Button
          title="See answer"
          iconName={IconName.Reveal}
          accentColor={accentColor}
          color={colors.white}
          onPress={() => {
            return;
          }}
        />
      </View>
    </View>
  );
}

export function Compositions() {
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>
      {Object.values(colors.palettes).map((c, i) => (
        <CompositionTest key={i} colorPalette={c} />
      ))}
    </View>
  );
}
