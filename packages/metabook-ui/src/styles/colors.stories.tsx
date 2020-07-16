import { number, withKnobs } from "@storybook/addon-knobs";
import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import Starburst from "../components/Starburst";
import colors from "./colors";
import * as layout from "./layout";
import { Title, Label, Body, Caption } from "../components/Text";

export default {
  title: "Style/Colors",
  decorators: [withKnobs],
};

export function Palette() {
  const radius = 96;
  const colorCount = colors.bg.length;
  return (
    <View style={{ backgroundColor: "#999" }}>
      <Svg
        width={radius * 7}
        height={radius * 7}
        viewBox={`${-radius * 3.5} ${-radius * 3.5} ${radius * 7} ${
          radius * 7
        }`}
      >
        {Array.from(new Array(colorCount).keys()).map((i) => {
          const theta = (i / colorCount) * 2 * Math.PI - Math.PI / 2;
          return (
            <>
              <Circle
                key={`${i}-bg`}
                cx={radius * 2 * Math.cos(theta)}
                cy={radius * 2 * Math.sin(theta)}
                r={radius / 2}
                fill={colors.bg[i]}
              />
              <Circle
                key={`${i}-fg`}
                cx={radius * 3 * Math.cos(theta)}
                cy={radius * 3 * Math.sin(theta)}
                r={radius / 2}
                fill={colors.fg[i]}
              />
            </>
          );
        })}
      </Svg>
    </View>
  );
}

const starburstLengths = [
  0.2,
  1.0,
  0.3,
  0.6,
  0.2,
  0.7,
  0.2,
  0.4,
  0.1,
  0.7,
  0.2,
  0.6,
  0.4,
  0.2,
  1.0,
  0.3,
  0.6,
  0.2,
  0.7,
  0.2,
  0.4,
  0.1,
  0.7,
  0.2,
  0.6,
  0.4,
];

function CompositionTest({
  backgroundColor,
  accentColor,
  secondaryColor,
  tertiaryColor,
}: {
  backgroundColor: string;
  accentColor: string;
  secondaryColor: string;
  tertiaryColor: string;
}) {
  const width = 375;

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
          size={width * 2}
          entries={starburstLengths.map((length, i) => ({
            color:
              i === 0
                ? accentColor
                : i < number("fraction complete", 0.3) * starburstLengths.length
                ? secondaryColor
                : tertiaryColor,
            length,
          }))}
          thickness={3}
        />
      </View>
      <Caption
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 7,
        }}
      >
        5d
      </Caption>

      <Body
        textStyle={{ color: accentColor }}
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 18,
        }}
      >
        Source context
      </Body>
      <Title>Primary content</Title>
      <Label textStyle={{ color: colors.white, marginTop: 128 }}>Button</Label>
    </View>
  );
}

export function Compositions() {
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>
      <CompositionTest
        backgroundColor={colors.bg[0]}
        accentColor={colors.fg[6]}
        secondaryColor={colors.bg[3]}
        tertiaryColor={colors.fg[0]}
      />
      <CompositionTest
        backgroundColor={colors.bg[1]}
        accentColor={colors.fg[7]}
        secondaryColor={colors.bg[3]}
        tertiaryColor={colors.tertiary[1]}
      />
      <CompositionTest
        backgroundColor={colors.bg[2]}
        accentColor={colors.fg[8]}
        secondaryColor={colors.bg[1]}
        tertiaryColor={colors.fg[2]}
      />
      <CompositionTest
        backgroundColor={colors.bg[3]}
        accentColor={colors.fg[9]}
        secondaryColor={colors.bg[1]}
        tertiaryColor={colors.tertiary[3]}
      />
      <CompositionTest
        backgroundColor={colors.bg[4]}
        accentColor={colors.fg[9]}
        secondaryColor={colors.bg[1]}
        tertiaryColor={colors.tertiary[4]}
      />
      <CompositionTest
        backgroundColor={colors.bg[5]}
        accentColor={colors.fg[3]}
        secondaryColor={colors.bg[3]}
        tertiaryColor={colors.tertiary[5]}
      />
      <CompositionTest
        backgroundColor={colors.bg[6]}
        accentColor={colors.fg[3]}
        secondaryColor={colors.bg[7]}
        tertiaryColor={colors.tertiary[6]}
      />
      <CompositionTest
        backgroundColor={colors.bg[7]}
        accentColor={colors.fg[3]}
        secondaryColor={colors.bg[5]}
        tertiaryColor={colors.tertiary[7]}
      />
      <CompositionTest
        backgroundColor={colors.bg[8]}
        accentColor={colors.fg[3]}
        secondaryColor={colors.bg[6]}
        tertiaryColor={colors.fg[8]}
      />
      <CompositionTest
        backgroundColor={colors.bg[9]}
        accentColor={colors.fg[3]}
        secondaryColor={colors.bg[6]}
        tertiaryColor={colors.tertiary[9]}
      />
      <CompositionTest
        backgroundColor={colors.bg[10]}
        accentColor={colors.fg[4]}
        secondaryColor={colors.bg[8]}
        tertiaryColor={colors.tertiary[10]}
      />
      <CompositionTest
        backgroundColor={colors.bg[11]}
        accentColor={colors.fg[4]}
        secondaryColor={colors.bg[1]}
        tertiaryColor={colors.tertiary[11]}
      />
    </View>
  );
}
