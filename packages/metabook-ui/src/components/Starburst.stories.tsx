import {
  withKnobs,
  number,
  text,
  boolean,
  select,
  button,
} from "@storybook/addon-knobs";
import React, { useState, useMemo, useEffect } from "react";
import { View, Text, Animated } from "react-native";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import Starburst from "./Starburst";
import seedrandom from "seedrandom";
import lerp from "../util/lerp";
import { colors } from "../styles";

export default {
  title: "Starburst",
  component: Starburst,
  decorators: [withKnobs],
};

function StarburstGrid(props: { size: number }) {
  const minCount = number("Min count", 5);
  const children = Array.from(
    new Array(number("Count", number("Max count", 120) - minCount)).keys(),
  ).map((i) => {
    const strokeCount = i + minCount;
    const entries = Array.from(new Array(strokeCount)).map(() => ({
      length: Math.random(),
      color: "black",
    }));
    return (
      <View key={i}>
        <Text>{strokeCount}</Text>
        <Starburst
          size={props.size}
          entries={entries}
          thickness={number("Thickness", 4)}
        />
      </View>
    );
  });
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>{children}</View>
  );
}

export function Sandbox() {
  const strokeCount = number("Line count", 25);
  const seed = text("Random seed", "seed");
  const rng = useMemo(() => seedrandom(seed), [seed]);

  const minLength = number("Line min", 0);
  const maxLength = number("Line max", 1);

  const size = number("Size", 500);

  let colorComposition: typeof colors.compositions[0];
  let backgroundColor: string;
  let strokeColor: string;
  let accentColor: string;
  let completedStrokeColor: string;
  const colorRange = {
    min: 0,
    max: colors.compositions.length - 1,
    range: true,
    step: 1,
  };
  if (boolean("Use composition", true)) {
    colorComposition =
      colors.compositions[number("Color palette index", 0, colorRange)];
    backgroundColor = colorComposition.backgroundColor;
    const strokeSelection = select(
      "Incomplete stroke color",
      ["secondary", "tertiary", "accent", "ink", "black", "white"],
      "tertiary",
    );
    strokeColor = {
      secondary: colorComposition.secondaryColor,
      tertiary: colorComposition.tertiaryColor,
      accent: colorComposition.accentColor,
      ink: colors.ink,
      black: "black",
      white: colors.white,
    }[strokeSelection];

    const completedStrokeSelection = select(
      "Completed stroke color",
      ["secondary", "tertiary", "accent", "ink", "black", "white"],
      "secondary",
    );
    completedStrokeColor = {
      secondary: colorComposition.secondaryColor,
      tertiary: colorComposition.tertiaryColor,
      accent: colorComposition.accentColor,
      ink: colors.ink,
      black: "black",
      white: colors.white,
    }[completedStrokeSelection];

    const accentColorSelection = select(
      "Accent stroke color",
      ["secondary", "tertiary", "accent", "ink", "black", "white"],
      "accent",
    );
    accentColor = {
      secondary: colorComposition.secondaryColor,
      tertiary: colorComposition.tertiaryColor,
      accent: colorComposition.accentColor,
      ink: colors.ink,
      black: "black",
      white: colors.white,
    }[accentColorSelection];
  } else {
    const strokeColorSource = select(
      "Stroke color source",
      ["bg", "fg", "ink", "white"],
      "fg",
    );
    const strokeColorIndex = number("Secondary color index", 1, colorRange);
    strokeColor = {
      bg: colors.bg[strokeColorIndex],
      fg: colors.fg[strokeColorIndex],
      ink: colors.ink,
      white: colors.white,
    }[strokeColorSource];

    const completedStrokeColorSource = select(
      "Completed stroke color source",
      ["bg", "fg", "ink", "white"],
      "fg",
    );
    const completedStrokeColorIndex = number(
      "Completeds stroke color index",
      1,
      colorRange,
    );
    completedStrokeColor = {
      bg: colors.bg[completedStrokeColorIndex],
      fg: colors.fg[completedStrokeColorIndex],
      ink: colors.ink,
      white: colors.white,
    }[completedStrokeColorSource];

    accentColor = colors.fg[0]; // TODO

    backgroundColor = colors.bg[number("BG color index", 0, colorRange)];
  }

  const [currentEntry, setCurrentEntry] = useState(0);
  // const currentEntry = number("Current entry number", 0);

  const [lengths, setLengths] = useState<number[]>([]);
  useEffect(
    () =>
      setLengths(
        Array.from(new Array(strokeCount).keys()).map(() =>
          lerp(rng(), 0, 1, minLength, maxLength),
        ),
      ),
    [maxLength, minLength, rng, strokeCount],
  );

  button("Change length", () => {
    setLengths((lengths) => {
      lengths[currentEntry] = Math.max(
        0,
        Math.min(1, lengths[currentEntry] + Math.random() - 0.5),
      );
      return lengths;
    });
    setTimeout(() => {
      setCurrentEntry((currentEntry) => currentEntry + 1);
    }, Math.random() * 300);
  });

  const entries = lengths.map((length, index) => ({
    length,
    color: index < currentEntry ? completedStrokeColor : strokeColor,
  }));

  return (
    <View
      style={{
        height: "100vh",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#eee",
      }}
    >
      <View style={{ backgroundColor: backgroundColor }}>
        <Starburst
          size={size}
          entries={entries}
          thickness={number("Thickness", 4)}
          accentOverlayColor={accentColor}
          entryAtHorizontal={currentEntry}
        />
      </View>
    </View>
  );
}

export function MediumSize() {
  return <StarburstGrid size={number("Size", 300)} />;
}

export function ReviewSize() {
  return <StarburstGrid size={number("Size", 700)} />;
}
