import type { Meta, StoryObj } from "@storybook/react-webpack5";
import React, { useEffect, useState } from "react";
import { Button, Text, View } from "react-native";
import seedrandom from "seedrandom";
import { colors } from "../styles/index.js";
import lerp from "../util/lerp.js";
import Starburst, { type StarburstProps } from "./Starburst.jsx";

const compositionColorOptions = [
  "secondary",
  "tertiary",
  "accent",
  "ink",
  "black",
  "white",
] as const;
const strokeColorSourceOptions = [
  "bg",
  "secondary",
  "shade",
  "ink",
  "white",
] as const;
const completedStrokeColorSourceOptions = [
  "bg",
  "secondary",
  "ink",
  "white",
] as const;
const accentStrokeColorSourceOptions = [
  "bg",
  "accent",
  "ink",
  "white",
] as const;

interface SandboxArgs {
  lineCount?: number;
  randomSeed?: string;
  lineMin?: number;
  lineMax?: number;
  useComposition?: boolean;
  colorPaletteIndex?: number;
  incompleteStrokeColor?: (typeof compositionColorOptions)[number];
  completedStrokeColor?: (typeof compositionColorOptions)[number];
  accentStrokeColor?: (typeof compositionColorOptions)[number];
  strokeColorSource?: (typeof strokeColorSourceOptions)[number];
  secondaryColorIndex?: number;
  completedStrokeColorSource?: (typeof completedStrokeColorSourceOptions)[number];
  completedStrokeColorIndex?: number;
  accentStrokeColorSource?: (typeof accentStrokeColorSourceOptions)[number];
  accentStrokeColorIndex?: number;
  backgroundColorIndex?: number;
  extraRotationDegrees?: number;
  scale?: number;
  translateX?: number;
  translateY?: number;
}

interface GridArgs {
  minCount?: number;
  count?: number;
  maxCount?: number;
}

type StarburstStoryArgs = StarburstProps & SandboxArgs & GridArgs;

const meta = {
  title: "Starburst",
  component: Starburst,
  args: {
    diameter: 500,
    entries: [],
    thickness: 4,
  },
  argTypes: {
    entries: { table: { disable: true } },
    accentOverlayColor: { table: { disable: true } },
    entryAtHorizontal: { table: { disable: true } },
  },
} satisfies Meta<StarburstStoryArgs>;
export default meta;

type Story = StoryObj<StarburstStoryArgs>;

function StarburstGrid({
  diameter,
  minCount = 5,
  count = 115,
  maxCount = 120,
  thickness,
}: StarburstStoryArgs) {
  const children = Array.from(
    new Array(Math.min(count, maxCount - minCount)).keys(),
  ).map((i) => {
    const strokeCount = i + minCount;
    const entries = Array.from(new Array(strokeCount)).map(() => ({
      value: Math.random(),
      color: "black",
    }));
    return (
      <View key={i}>
        <Text>{strokeCount}</Text>
        <Starburst
          diameter={diameter}
          entries={entries}
          thickness={thickness}
        />
      </View>
    );
  });
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>{children}</View>
  );
}

function getPaletteByIndex(index: number): colors.ColorPalette {
  return colors.palettes[colors.orderedPaletteNames[index]];
}

function SandboxStory({
  lineCount = 25,
  randomSeed = "seed",
  lineMin = 0,
  lineMax = 1,
  diameter,
  useComposition = true,
  colorPaletteIndex = 0,
  incompleteStrokeColor = "tertiary",
  completedStrokeColor = "secondary",
  accentStrokeColor = "accent",
  strokeColorSource = "shade",
  secondaryColorIndex = 1,
  completedStrokeColorSource = "secondary",
  completedStrokeColorIndex = 1,
  accentStrokeColorSource = "accent",
  accentStrokeColorIndex = 1,
  backgroundColorIndex = 0,
  extraRotationDegrees = 0,
  scale = 1,
  translateX = 0,
  translateY = 0,
  thickness,
}: StarburstStoryArgs) {
  let backgroundColor: string;
  let strokeColor: string;
  let accentColor: string;
  let completedColor: string;
  if (useComposition) {
    const colorComposition = getPaletteByIndex(colorPaletteIndex);
    backgroundColor = colorComposition.backgroundColor;
    const colorMapping = {
      secondary: colorComposition.secondaryAccentColor,
      tertiary: colorComposition.secondaryBackgroundColor,
      accent: colorComposition.accentColor,
      ink: colors.ink,
      black: "black",
      white: colors.white,
    };
    strokeColor = colorMapping[incompleteStrokeColor];
    completedColor = colorMapping[completedStrokeColor];
    accentColor = colorMapping[accentStrokeColor];
  } else {
    const secondaryPalette = getPaletteByIndex(secondaryColorIndex);
    strokeColor = {
      bg: secondaryPalette.backgroundColor,
      secondary: secondaryPalette.secondaryAccentColor,
      shade: secondaryPalette.secondaryBackgroundColor,
      ink: colors.ink,
      white: colors.white,
    }[strokeColorSource];

    const completedPalette = getPaletteByIndex(completedStrokeColorIndex);
    completedColor = {
      bg: completedPalette.backgroundColor,
      secondary: completedPalette.secondaryAccentColor,
      ink: colors.ink,
      white: colors.white,
    }[completedStrokeColorSource];

    const accentPalette = getPaletteByIndex(accentStrokeColorIndex);
    accentColor = {
      bg: accentPalette.backgroundColor,
      accent: accentPalette.accentColor,
      ink: colors.ink,
      white: colors.white,
    }[accentStrokeColorSource];

    backgroundColor = getPaletteByIndex(backgroundColorIndex).backgroundColor;
  }

  const [currentEntry, setCurrentEntry] = useState(0);
  const [values, setLengths] = useState<number[]>([]);
  useEffect(() => {
    const rng = seedrandom(randomSeed);
    setLengths(
      Array.from(new Array(lineCount).keys()).map(() =>
        lerp(rng(), 0, 1, lineMin, lineMax),
      ),
    );
  }, [lineCount, lineMax, lineMin, randomSeed]);

  const changeLength = () => {
    setLengths((lengths) => {
      lengths[currentEntry] = Math.max(
        0,
        Math.min(1, lengths[currentEntry] + (Math.random() - 0.2) * 0.5),
      );
      return lengths;
    });
    const delay =
      currentEntry === 0 ? 500 : Math.max(0, 500 - currentEntry * 100);
    setTimeout(() => {
      setCurrentEntry((entry) => entry + 1);
    }, delay);
  };

  const entries = values.map((value, index) => ({
    value,
    color: index < currentEntry ? completedColor : strokeColor,
  }));

  return (
    <View
      style={{
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#eee",
      }}
    >
      <View style={{ position: "absolute", left: 16, top: 16, zIndex: 1 }}>
        <Button title="Change length" onPress={changeLength} />
      </View>
      <View style={{ backgroundColor }}>
        <View
          style={{
            transform: [
              { rotateZ: `${extraRotationDegrees}deg` },
              { scale },
              { translateX },
              { translateY },
            ],
          }}
        >
          <Starburst
            diameter={diameter}
            entries={entries}
            thickness={thickness}
            accentOverlayColor={accentColor}
            entryAtHorizontal={currentEntry}
          />
        </View>
      </View>
    </View>
  );
}

const paletteIndexControl = {
  type: "range" as const,
  min: 0,
  max: colors.orderedPaletteNames.length - 1,
  step: 1,
};

export const Sandbox = {
  args: {
    lineCount: 25,
    randomSeed: "seed",
    lineMin: 0,
    lineMax: 1,
    diameter: 500,
    useComposition: true,
    colorPaletteIndex: 0,
    incompleteStrokeColor: "tertiary",
    completedStrokeColor: "secondary",
    accentStrokeColor: "accent",
    strokeColorSource: "shade",
    secondaryColorIndex: 1,
    completedStrokeColorSource: "secondary",
    completedStrokeColorIndex: 1,
    accentStrokeColorSource: "accent",
    accentStrokeColorIndex: 1,
    backgroundColorIndex: 0,
    extraRotationDegrees: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    thickness: 4,
  },
  argTypes: {
    lineCount: { name: "Line count", control: { type: "number" } },
    randomSeed: { name: "Random seed", control: { type: "text" } },
    lineMin: { name: "Line min", control: { type: "number" } },
    lineMax: { name: "Line max", control: { type: "number" } },
    diameter: { name: "Size", control: { type: "number" } },
    useComposition: { name: "Use composition", control: { type: "boolean" } },
    colorPaletteIndex: {
      name: "Color palette index",
      control: paletteIndexControl,
      if: { arg: "useComposition", truthy: true },
    },
    incompleteStrokeColor: {
      name: "Incomplete stroke color",
      control: { type: "select" },
      options: compositionColorOptions,
      if: { arg: "useComposition", truthy: true },
    },
    completedStrokeColor: {
      name: "Completed stroke color",
      control: { type: "select" },
      options: compositionColorOptions,
      if: { arg: "useComposition", truthy: true },
    },
    accentStrokeColor: {
      name: "Accent stroke color",
      control: { type: "select" },
      options: compositionColorOptions,
      if: { arg: "useComposition", truthy: true },
    },
    strokeColorSource: {
      name: "Stroke color source",
      control: { type: "select" },
      options: strokeColorSourceOptions,
      if: { arg: "useComposition", truthy: false },
    },
    secondaryColorIndex: {
      name: "Secondary color index",
      control: paletteIndexControl,
      if: { arg: "useComposition", truthy: false },
    },
    completedStrokeColorSource: {
      name: "Completed stroke color source",
      control: { type: "select" },
      options: completedStrokeColorSourceOptions,
      if: { arg: "useComposition", truthy: false },
    },
    completedStrokeColorIndex: {
      name: "Completed stroke color index",
      control: paletteIndexControl,
      if: { arg: "useComposition", truthy: false },
    },
    accentStrokeColorSource: {
      name: "Accent stroke color source",
      control: { type: "select" },
      options: accentStrokeColorSourceOptions,
      if: { arg: "useComposition", truthy: false },
    },
    accentStrokeColorIndex: {
      name: "Accent stroke color index",
      control: paletteIndexControl,
      if: { arg: "useComposition", truthy: false },
    },
    backgroundColorIndex: {
      name: "BG color index",
      control: paletteIndexControl,
      if: { arg: "useComposition", truthy: false },
    },
    extraRotationDegrees: {
      name: "Extra rotation degrees",
      control: { type: "number" },
    },
    scale: { name: "Scale", control: { type: "number" } },
    translateX: {
      name: "Translate X",
      control: { type: "number", min: -100, max: 100 },
    },
    translateY: {
      name: "Translate Y",
      control: { type: "number", min: -100, max: 100 },
    },
    thickness: { name: "Thickness", control: { type: "number" } },
  },
  render: (args) => <SandboxStory {...args} />,
} satisfies Story;

const gridArgTypes = {
  diameter: { name: "Diameter", control: { type: "number" as const } },
  minCount: { name: "Min count", control: { type: "number" as const } },
  count: { name: "Count", control: { type: "number" as const } },
  maxCount: { name: "Max count", control: { type: "number" as const } },
  thickness: { name: "Thickness", control: { type: "number" as const } },
};

export const MediumSize = {
  args: {
    diameter: 300,
    minCount: 5,
    count: 115,
    maxCount: 120,
    thickness: 4,
  },
  argTypes: gridArgTypes,
  render: (args) => <StarburstGrid {...args} />,
} satisfies Story;

export const ReviewSize = {
  args: {
    diameter: 700,
    minCount: 5,
    count: 115,
    maxCount: 120,
    thickness: 4,
  },
  argTypes: gridArgTypes,
  render: (args) => <StarburstGrid {...args} />,
} satisfies Story;
