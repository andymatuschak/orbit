import React from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import colors from "./colors";

export default {
  title: "Style/Colors",
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
