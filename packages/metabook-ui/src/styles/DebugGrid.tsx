import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import * as layout from "./layout";

export default function DebugGrid() {
  const [size, setSize] = useState<[number, number] | null>(null);
  return (
    <View
      style={{ ...StyleSheet.absoluteFillObject }}
      onLayout={useCallback(
        ({
          nativeEvent: {
            layout: { width, height },
          },
        }) => {
          setSize([width, height]);
        },
        [],
      )}
    >
      {size && (
        <Svg width={size[0]} height={size[1]}>
          {Array.from(
            new Array(Math.ceil(size[1] / layout.gridUnit)).keys(),
          ).map((row) => {
            const y = row * layout.gridUnit - 0.5;
            return (
              <>
                <Line
                  key={row}
                  x1={0}
                  x2={size[0]}
                  y1={y}
                  y2={y}
                  strokeWidth={1}
                  stroke="#00b8f2"
                />
                {row % 6 === 0 && (
                  <Rect
                    key={`${row}-fill`}
                    x={0}
                    y={y}
                    width={size[0]}
                    height={layout.gridUnit}
                    fill="#00b8f2"
                  />
                )}
              </>
            );
          })}
        </Svg>
      )}
    </View>
  );
}
