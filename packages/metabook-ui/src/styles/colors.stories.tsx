import { number, withKnobs } from "@storybook/addon-knobs";
import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from ".";
import Starburst from "../components/Starburst";
import { Body, Caption, Label, Title } from "../components/Text";
import * as layout from "./layout";

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
        color={accentColor}
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 18,
        }}
      >
        Source context
      </Body>
      <Title>Primary content</Title>
      <Label color={colors.white} style={{ marginTop: 128 }}>
        Button
      </Label>
    </View>
  );
}

export function Compositions() {
  return (
    <View style={{ flexWrap: "wrap", flexDirection: "row" }}>
      {colors.compositions.map((c, i) => (
        <CompositionTest
          key={i}
          backgroundColor={c.backgroundColor}
          accentColor={c.accentColor}
          secondaryColor={c.secondaryColor}
          tertiaryColor={c.tertiaryColor}
        />
      ))}
    </View>
  );
}
