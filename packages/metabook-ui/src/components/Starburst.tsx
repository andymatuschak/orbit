import React, { useRef } from "react";
import { Animated } from "react-native";
import Svg, { ClipPath, G, Path } from "react-native-svg";
import lerp from "../util/lerp";
import usePrevious from "./hooks/usePrevious";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import WithAnimatedValue = Animated.WithAnimatedValue;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);

function getRayPath(
  innerRadius: number,
  outerRadius: number,
  strokeRadius: number,
  theta: number,
  thickness: number,
): string {
  const unitX = Math.cos(theta);
  const unitY = -1 * Math.sin(theta);
  const x1 = 0.5 + outerRadius * unitX;
  const x2 = 0.5 + strokeRadius * unitX;
  const y1 = 0.5 + outerRadius * unitY;
  const y2 = 0.5 + strokeRadius * unitY;
  const xThickness = 0.5 * thickness * -unitY;
  const yThickness = 0.5 * thickness * unitX;

  const localQuillLength = outerRadius - innerRadius;
  // The coordinates for the tapered quill at the end of the starburst rays were extracted from an SVG. This function transforms a point in that template SVG's coordinate space to the space of the ray.
  function quillPoint(x: number, y: number) {
    const quillPathLength = 1.75; // The quill is 1pt high in the template SVG.
    // Translate the center of the quill tip to the origin.
    x -= 0.5 * quillPathLength;
    y -= 0.5;
    // Scale it to the appropriate length and thickness.
    x *= localQuillLength / quillPathLength;
    y *= thickness;
    // Translate it so that its tip touches the inner radius.
    x += 0.5 + innerRadius + 0.5 * localQuillLength;
    y += 0.5;
    // Rotate it about the inner radius circle.
    const finalX = unitX * x - unitY * y + 0.5 * (1 - unitX + unitY);
    const finalY = unitY * x + unitX * y + 0.5 * (1 - unitY - unitX);
    return `${finalX} ${finalY}`;
  }

  return `M${quillPoint(0.875, 0.10825)}C${quillPoint(
    0.5835,
    0.18575,
  )} ${quillPoint(0.29175, 0.293)} ${quillPoint(0, 0.5)}C${quillPoint(
    0.29175,
    0.707,
  )} ${quillPoint(0.5835, 0.81425)} ${quillPoint(0.875, 0.89175)}C${quillPoint(
    1.16675,
    0.965,
  )} ${quillPoint(1.45825, 0.99925)} ${quillPoint(1.75, 1)}L${quillPoint(
    1.75,
    0,
  )} ${x2 - xThickness} ${y2 - yThickness} ${x2 + xThickness} ${
    y2 + yThickness
  } ${x1 + xThickness} ${y1 + yThickness} ${x1 - xThickness} ${
    y1 - yThickness
  }C${quillPoint(1.45825, 0.000750005)} ${quillPoint(
    1.16675,
    0.035,
  )} ${quillPoint(0.875, 0.10825)}`;
}

interface AnimationState {
  entryIndex: number;
  fromLength: number;
  value: Animated.Value;
}

const animationTiming: Omit<Animated.SpringAnimationConfig, "toValue"> = {
  speed: 20,
  bounciness: 0,
  useNativeDriver: false,
};

export interface StarburstProps {
  size: number;
  entries: StarburstEntry[];
  thickness: number;
  accentOverlayColor?: string;
  entryAtHorizontal?: number;
  origin?: readonly [number, number]; // positions the center of the starburst at this position, in pixels, expressed from the top-left of the starburst element
}

export interface StarburstEntry {
  length: number; // [0,1]
  color: string;
}

export default React.memo(function Starburst({
  entries,
  size,
  thickness,
  accentOverlayColor,
  entryAtHorizontal,
  origin,
}: StarburstProps) {
  const previousEntries = usePrevious(entries);
  const canAnimateEntries =
    previousEntries && entries.length === previousEntries.length;
  const animationState = useRef<AnimationState>();

  const segmentSin = Math.sin((2 * Math.PI) / entries.length);
  const innerRadiusSpacing = thickness / 3.25; // The space between spokes at their tapered points.
  const outerRadiusSpacing = thickness / 2.75; // The tightest margin between spokes at their thickest points.
  const innerRadius = (innerRadiusSpacing * 2.0) / size / segmentSin;
  const outerRadius =
    (thickness + outerRadiusSpacing * 2.0) / size / segmentSin;
  const unitThickness = thickness / size;

  function getRadiusForEntryLength(length: number): number {
    return lerp(length, 0, 1, outerRadius, 0.5);
  }

  const allPaths: string[] = [];
  const pathsByColor: { [key: string]: string[] } = {};
  let animatingColorEntry: {
    color: string;
    index: number;
    fromPath: string;
  } | null = null;
  entries.forEach(({ length, color }, index) => {
    const theta = (-index / entries.length) * 2 * Math.PI;
    const strokeRadius = getRadiusForEntryLength(length);
    const path = getRayPath(
      innerRadius,
      outerRadius,
      strokeRadius,
      theta,
      unitThickness,
    );

    if (!pathsByColor[color]) {
      pathsByColor[color] = [];
    }
    pathsByColor[color].push(path);
    allPaths.push(path);

    if (canAnimateEntries && length !== previousEntries![index].length) {
      if (animationState.current) {
        animationState.current.value.stopAnimation();
      }
      const fromLength = previousEntries![index].length;
      const animatedLength = new Animated.Value(0);
      animationState.current = {
        entryIndex: index,
        fromLength,
        value: animatedLength,
      };
      Animated.spring(animatedLength, {
        toValue: 1,
        ...animationTiming,
      }).start(() => {
        animationState.current = undefined;
      });
    }
    if (animationState.current?.entryIndex === index) {
      animatingColorEntry = {
        color,
        index: pathsByColor[color].length - 1,
        fromPath: getRayPath(
          innerRadius,
          outerRadius,
          getRadiusForEntryLength(animationState.current.fromLength),
          theta,
          unitThickness,
        ),
      };
    }
  });

  const outerRotationDegrees = useTransitioningValue({
    value:
      entries.length > 0
        ? -((entryAtHorizontal ?? 0) * 360) / entries.length
        : 0,
    timing: { ...animationTiming, type: "spring" },
  }).interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
  const rotationStyle = {
    transform: [
      // Rotate about 0.5, 0.5.
      { translateX: 0.5 },
      { translateY: 0.5 },
      { rotate: outerRotationDegrees },
      { translateX: -0.5 },
      { translateY: -0.5 },
    ],
  };

  function getAnimatedPath(
    paths: string[],
    animatingEntry: { index: number; oldValue: string } | null,
  ) {
    const joinedPaths = paths.join(" ");
    let d: WithAnimatedValue<string>;
    if (animatingEntry === null) {
      d = joinedPaths;
    } else {
      d = animationState.current!.value.interpolate({
        inputRange: [0, 1],
        outputRange: [
          [
            ...paths.slice(0, animatingEntry.index),
            animatingEntry.oldValue,
            ...paths.slice(animatingEntry.index + 1),
          ].join(" "),
          joinedPaths,
        ],
      });
    }
    return d;
  }

  let viewBox: string;
  let width: number;
  let height: number;
  if (origin) {
    const x = 0.5 - origin[0] / size;
    const y = 0.5 - origin[1] / size;
    viewBox = `${x} ${y} ${1 - x} ${1 - y}`;
    width = size / 2 + origin[0];
    height = size / 2 + origin[1];
  } else {
    viewBox = "0 0 1 1";
    width = size;
    height = size;
  }

  return (
    <Svg height={height} width={width} viewBox={viewBox}>
      <AnimatedG
        // @ts-ignore The type definition is missing this prop, but it's there!
        style={rotationStyle}
      >
        {Object.keys(pathsByColor).map((color) => {
          return (
            <AnimatedPath
              key={color}
              d={getAnimatedPath(
                pathsByColor[color],
                color === animatingColorEntry?.color
                  ? {
                      index: animatingColorEntry.index,
                      oldValue: animatingColorEntry.fromPath,
                    }
                  : null,
              )}
              fill={color}
            />
          );
        })}
      </AnimatedG>
      {accentOverlayColor && (
        <>
          <ClipPath id="accentPath">
            <Path
              d={getRayPath(innerRadius, outerRadius, 0.5, 0, unitThickness)}
            />
          </ClipPath>
          <G clipPath="url(#accentPath)">
            <AnimatedG
              // @ts-ignore The type definition is missing this prop, but it's there!
              style={rotationStyle}
            >
              <AnimatedPath
                d={getAnimatedPath(
                  allPaths,
                  animationState.current
                    ? {
                        index: animationState.current.entryIndex,
                        oldValue: animatingColorEntry!.fromPath,
                      }
                    : null,
                )}
                fill={accentOverlayColor}
              />
            </AnimatedG>
          </G>
        </>
      )}
    </Svg>
  );
});
