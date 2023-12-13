import React, { useCallback, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Svg, Line, Rect } from "react-native-svg";
import * as layout from "../styles/layout.js";

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
          const y = row * layout.gridUnit + 0.5; // position on the half pixel. we increment by 0.5 instead of subtracting by 0.5 because otherwise the first line is off-canvas. balanced by negative marginTop below.
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
      style={{
        ...StyleSheet.absoluteFillObject,
        marginTop: -1,
        zIndex: -1,
      }}
      onLayout={useCallback(
        (e: LayoutChangeEvent) => {
          const {nativeEvent: {layout: {width, height}}} = e;
          setSize([width, height]);
        },
        [],
      )}
      pointerEvents="none"
    >
      {size && (
        <Svg width={size[0]} height={size[1]}>
          {children}
        </Svg>
      )}
    </View>
  );
}
