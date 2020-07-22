import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import * as layout from "../styles/layout";

export default function DebugGrid({
  shouldShowMajorDivisions,
}: {
  shouldShowMajorDivisions?: boolean;
}) {
  const [size, setSize] = useState<[number, number] | null>(null);

  const children = useMemo(
    () =>
      size &&
      Array.from(new Array(Math.ceil(size[1] / layout.gridUnit)).keys()).map(
        (row) => {
          const y = row * layout.gridUnit - 0.5;
          return (
            <React.Fragment key={row}>
              <Line
                x1={0}
                x2={size[0]}
                y1={y}
                y2={y}
                strokeWidth={1}
                stroke="#00b8f2"
              />
              {shouldShowMajorDivisions && row % 6 === 0 && (
                <Rect
                  x={0}
                  y={y}
                  width={size[0]}
                  height={layout.gridUnit}
                  fill="#00b8f2"
                />
              )}
            </React.Fragment>
          );
        },
      ),
    [shouldShowMajorDivisions, size],
  );

  return (
    <View
      style={{ ...StyleSheet.absoluteFillObject, zIndex: -1 }}
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
          {children}
        </Svg>
      )}
    </View>
  );
}
