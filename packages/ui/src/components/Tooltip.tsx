import React, { useRef, useState, useReducer, useCallback, useMemo } from "react";
import { useEffect } from "react";
import {
  ColorValue,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";


const styles = StyleSheet.create({
  triangle: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'white',
  },
  container: {
    position: "absolute",
    width: "100%",
    height: "100%",
    left: 0,
    top: 0
  },
  tooltip: {
    padding: "10px",
    backgroundColor: "black",
    opacity: 0.5,
    zIndex: 10000,
  }
});

type TriangleProps = {
  pointerColor?: ColorValue;
  style?: StyleProp<ViewStyle>;
  placement: TooltipPosition;
  trianglePosition: { top?: number, left?: number };
};

const TRIANGLE_ROTATION: { [key: string]: number } = {
  "bottom": 0,
  "left": 90,
  "top": 180,
  "right": 270
}

const Triangle: React.FC<TriangleProps> = ({ style, pointerColor, placement, trianglePosition }) => (
  <View
    style={StyleSheet.flatten([
      styles.triangle,
      {
        borderBottomColor: pointerColor,
        transform: [{ rotate: `${TRIANGLE_ROTATION[placement]}deg`}],
        ...trianglePosition,
      },
      style,
    ])}
  />
);

export type TooltipPosition = "top"
  | "right"
  | "bottom"
  | "left"
  | "overlay"
  | "inset-bottom-left"
  | "inset-bottom-right"
  | "inset-top-left"
  | "inset-top-right"
  | "cursor" 

export type TooltipProps = {
  placement?: TooltipPosition;
  stayOnScreen?: boolean;
  show: boolean;
  anchorRef: React.MutableRefObject<View | null>;
} & ({ text: string; } | { children: React.ReactNode; })

const getPositions = (
  { placement, anchor, tooltip }: { placement: string, anchor: Measure, tooltip: Measure }
): TooltipState => {
  switch (placement) {
    case "top":
      return {
        tooltipPosition: { top: -tooltip.height - 16, left: anchor.width/2 - tooltip.width/2 },
        trianglePosition: { top: tooltip.height - 1, left: tooltip.width/2 - 7.5 }
      }
    case "right":
      return {
        tooltipPosition: { top: anchor.height/2 - tooltip.height/2, left: anchor.width + 15 },
        trianglePosition: { top: tooltip.height/2 - 7.5, left: -15 }
      }
    case "bottom":
      return {
        tooltipPosition: { top: anchor.height + 15, left: anchor.width/2 - tooltip.width/2 },
        trianglePosition: { top: -15, left: tooltip.width/2 - 7.5 }
      }
    case "left":
      return {
        tooltipPosition: { top: anchor.height/2 - tooltip.height/2, left: -tooltip.width - 16 },
        trianglePosition: { top: tooltip.height/2 - 7.5, left: tooltip.width - 1 }
      }
    case "overlay":
      return {
        tooltipPosition: { top: 0, left: 0, width: anchor.width, height: anchor.height },
        trianglePosition: {}
      }
    case "inset-bottom-left":
      return {
        tooltipPosition: { bottom: 0, left: 0 },
        trianglePosition: {}
      }
    case "inset-top-left":
      return {
        tooltipPosition: { top: 0, left: 0 },
        trianglePosition: {}
      }
    case "inset-top-right":
      return {
        tooltipPosition: { top: 0, right: 0 },
        trianglePosition: {}
      }
    case "inset-bottom-right":
      return {
        tooltipPosition: { bottom: 0, right: 0 },
        trianglePosition: {}
      }
    default:
      return { tooltipPosition: {}, trianglePosition: {} }
  }
}

type UIPosition = { top?: number, bottom?: number, left?: number, right?: number, width?: number, height?: number }

type TooltipState = {
  tooltipPosition?: UIPosition,
  trianglePosition?: UIPosition,
}

type Measure = { width?: number, height?: number, x?: number, y?: number, pageX?: number, pageY?: number, }

export default (props: TooltipProps) => {
  const {
    placement = "top",
    show,
    anchorRef,
    text,
    children,
  } = props;

  const tooltipRef = useRef<View | null>(null)
  const containerRef = useRef<View | null>(null)

  const [{ tooltipPosition, trianglePosition }, dispatch] = useReducer((
    state: TooltipState,
    { type, payload }: { type: string, payload: any }
  ) => {
    if (type === "init") {
      return { ...getPositions(payload) }
    }
    if (type === "move") {
      return {
        tooltipPosition: { ...payload }
      }
    }
    return state
  }, {})

  const [containerMeasure, setContainerMeasure] = useState<Measure>({})
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.measure((x, y, width, height, pageX, pageY) => {
        setContainerMeasure({
          pageX,
          pageY,
        })
      })
    }
  }, [containerRef])

  const [anchorMeasure, setAnchorMeasure] = useState<Measure>({})
  useEffect(() => {
    if (anchorRef.current) {
      anchorRef.current.measure((x, y, width, height) => {
        setAnchorMeasure({
          width,
          height,
        })
      })
    }
  }, [anchorRef])
  
  useEffect(() => {
    if (anchorMeasure.width && tooltipRef.current) {
      tooltipRef.current.measure((x, y, width, height) => {
        dispatch({
          type: "init",
          payload: {
            placement,
            anchor: anchorMeasure,
            tooltip: { width, height }
          }
        })
      })
    }
  }, [
    anchorMeasure,
    tooltipRef.current,
    show,
    placement
  ])

  const trackCursor = useCallback(
    (e: React.MouseEvent) => {
      if (!containerMeasure) return
      dispatch({
        type: "move",
        payload: {
          top: e.clientY - containerMeasure.pageY,
          left: e.clientX - containerMeasure.pageX,
        }
      })
    },
    [containerMeasure]
  )

  const mouseEvents = useMemo(() => placement === "cursor" ? {
    onMouseMove: trackCursor,
  } : {}, [placement, trackCursor])

  // TODO: a "stay-on-screen" effect
  // TODO: potentially use composition instead of anchorRef
  // =====] how do you do this without affecting the child's original context?
  // =====] e.g. for current Hoverable/Button implementation we require Pressable to receive mouse events

  // embedded views to pick up the "cursor" event
  return (
    <View
      ref={containerRef}
      style={styles.container}
      {...mouseEvents}
    >
      <View
        ref={tooltipRef}
        style={StyleSheet.flatten([
          (
            !show || (placement === "cursor" && !tooltipPosition.left)
          ) && { visibility: "hidden" },
          {
            position: (placement.indexOf("inset") === 0 || placement === "cursor") ? "absolute" : "relative",
            width: placement === "overlay" ? "100%" : "fit-content",
            height: placement === "overlay" ? "100%" : "fit-content",
            ...tooltipPosition
          },
          styles.tooltip,
        ])}
      >
        {["top", "right", "bottom", "left"].includes(placement) && <Triangle placement={placement} trianglePosition={trianglePosition} />}
        {children || (
          <div style={{ color: "white" }}>
            {text}
          </div>
        )}
      </View>
    </View>
  );
};
