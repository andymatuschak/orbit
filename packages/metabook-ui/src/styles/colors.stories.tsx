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

const starburstValues = [
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
              color: i < numberComplete ? secondaryColor : tertiaryColor,
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
        <Caption>5d</Caption>
      </View>

      <View
        style={{
          marginBottom: layout.gridUnit,
          marginTop: layout.gridUnit * 18,
        }}
      >
        <Body color={accentColor}>Source context</Body>
      </View>
      <Title>Primary content</Title>
      <View style={{ marginTop: 128 }}>
        <Label color={colors.white}>Button</Label>
      </View>
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
