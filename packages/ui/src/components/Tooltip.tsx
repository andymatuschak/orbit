import React, { useEffect, useRef, useState } from "react";
import {
  ColorValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

const TRIANGLE_SIZE = 16;
const TRIANGLE_OFFSET = 15; // TODO: relate this to TRIANGLE_SIZE as styles change e.g TRIANGLE_SIZE - CONTAINER_BORDER

const styles = StyleSheet.create({
  triangle: {
    position: "absolute",
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: TRIANGLE_SIZE / 2,
    borderRightWidth: TRIANGLE_SIZE / 2,
    borderBottomWidth: TRIANGLE_SIZE,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "white",
  },
  container: {
    position: "absolute",
    width: "100%",
    height: "100%",
    left: 0,
    top: 0,
  },
  tooltip: {
    padding: "10px",
    backgroundColor: "black",
    opacity: 0.5,
    zIndex: 10000,
  },
});

type TriangleProps = {
  pointerColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
  placement: TooltipPosition;
  trianglePosition: { top?: number; left?: number };
};

const triangleAnglesByPlacement: { [key: string]: number } = {
  bottom: 0,
  left: 90,
  top: 180,
  right: 270,
};

const Triangle: React.FC<TriangleProps> = ({
  style,
  pointerColor,
  placement,
  trianglePosition,
}) => (
  <View
    style={StyleSheet.flatten([
      styles.triangle,
      {
        borderBottomColor: pointerColor,
        transform: [{ rotate: `${triangleAnglesByPlacement[placement]}deg` }],
        ...trianglePosition,
      },
      style,
    ])}
  />
);

export type TooltipPosition =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "overlay"
  | "inset-bottom-left"
  | "inset-bottom-right"
  | "inset-top-left"
  | "inset-top-right";

export type TooltipProps = {
  placement?: TooltipPosition;
  show: boolean;
  anchorRef: React.MutableRefObject<View | null>;
  children: React.ReactNode;
};

const getPositions = ({
  placement,
  anchor,
  tooltip,
}: {
  placement: string;
  anchor: Size;
  tooltip: Size;
}): TooltipState => {
  switch (placement) {
    case "top":
      return {
        tooltipPosition: {
          top: -tooltip.height - TRIANGLE_SIZE,
          left: (anchor.width - tooltip.width) / 2,
        },
        trianglePosition: {
          top: tooltip.height - 1,
          left: (tooltip.width - TRIANGLE_OFFSET) / 2,
        },
      };
    case "right":
      return {
        tooltipPosition: {
          top: (anchor.height - tooltip.height) / 2,
          left: anchor.width + TRIANGLE_OFFSET,
        },
        trianglePosition: {
          top: (tooltip.height - TRIANGLE_OFFSET) / 2,
          left: -TRIANGLE_OFFSET,
        },
      };
    case "bottom":
      return {
        tooltipPosition: {
          top: anchor.height + TRIANGLE_OFFSET,
          left: (anchor.width - tooltip.width) / 2,
        },
        trianglePosition: {
          top: -TRIANGLE_OFFSET,
          left: (tooltip.width - TRIANGLE_OFFSET) / 2,
        },
      };
    case "left":
      return {
        tooltipPosition: {
          top: (anchor.height - tooltip.height) / 2,
          left: -tooltip.width - TRIANGLE_SIZE,
        },
        trianglePosition: {
          top: (tooltip.height - TRIANGLE_OFFSET) / 2,
          left: tooltip.width - 1,
        },
      };
    case "overlay":
      return {
        tooltipPosition: {
          top: 0,
          left: 0,
          width: anchor.width,
          height: anchor.height,
        },
        trianglePosition: {},
      };
    case "inset-bottom-left":
      return {
        tooltipPosition: { bottom: 0, left: 0 },
        trianglePosition: {},
      };
    case "inset-top-left":
      return {
        tooltipPosition: { top: 0, left: 0 },
        trianglePosition: {},
      };
    case "inset-top-right":
      return {
        tooltipPosition: { top: 0, right: 0 },
        trianglePosition: {},
      };
    case "inset-bottom-right":
      return {
        tooltipPosition: { bottom: 0, right: 0 },
        trianglePosition: {},
      };
    default:
      return { tooltipPosition: {}, trianglePosition: {} };
  }
};

type UIPosition = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number;
  height?: number;
};

type TooltipState = {
  tooltipPosition: UIPosition;
  trianglePosition: UIPosition;
};

type Size = {
  width: number;
  height: number;
};

export default React.memo(function Tooltip(props: TooltipProps) {
  const { placement = "top", show, anchorRef, children } = props;

  const tooltipRef = useRef<View | null>(null);
  const containerRef = useRef<View | null>(null);

  const initState: TooltipState = {
    tooltipPosition: {},
    trianglePosition: {},
  };
  const [{ tooltipPosition, trianglePosition }, setPosition] =
    useState(initState);

  const [anchorMeasure, setAnchorMeasure] = useState<Size | null>(null);
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.measure((x, y, width, height) => {
        setAnchorMeasure({
          width,
          height,
        });
      });
    }
  }, [anchorRef]);

  useEffect(() => {
    if (anchorMeasure?.width && tooltipRef.current) {
      tooltipRef.current.measure((x, y, width, height) => {
        setPosition(
          getPositions({
            placement,
            anchor: anchorMeasure,
            tooltip: { width, height },
          }),
        );
      });
    }
  }, [anchorMeasure, show, placement]);

  // TODO: a "stay-on-screen" effect
  // TODO: potentially use composition instead of anchorRef
  // =====] how do you do this without affecting the child's original context?
  // =====] e.g. for current Hoverable/Button implementation we require Pressable to receive mouse events

  // embedded views to pick up the "cursor" event
  return (
    <View ref={containerRef} style={styles.container}>
      <View
        ref={tooltipRef}
        style={StyleSheet.flatten([
          !show && {
            display: "none",
          },
          {
            position:
              placement.indexOf("inset") === 0 ? "absolute" : "relative",
            width: placement === "overlay" ? "100%" : "fit-content",
            height: placement === "overlay" ? "100%" : "fit-content",
            ...tooltipPosition,
          },
          styles.tooltip,
        ])}
      >
        {["top", "right", "bottom", "left"].includes(placement) && (
          <Triangle placement={placement} trianglePosition={trianglePosition} />
        )}
        {typeof children === "string" ? (
          <div style={{ color: "white" }}>{children}</div>
        ) : (
          children
        )}
      </View>
    </View>
  );
});
