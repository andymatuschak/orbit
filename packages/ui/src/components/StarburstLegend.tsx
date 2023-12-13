import { SpacedRepetitionSchedulerConfiguration } from "@withorbit/core";
import React, { useMemo } from "react";
import { Animated, View } from "react-native";
import { generateIntervalSequence } from "../util/generateIntervalSequence.js";
import { layout, type } from "../styles/index.js";
import { useTransitioningValue } from "./hooks/useTransitioningValue.js";
import {
  getStarburstRayLength,
  getStarburstRayValueForInterval,
} from "./Starburst.jsx";

const StarburstLegendEntry = React.memo(function StarburstLegendEntry({
  label,
  rayLength,
  starburstThickness,
  status,
  pastLabelColor,
  presentLabelColor,
  futureLabelColor,
  futureTickColor,
  backgroundColor,
}: {
  rayLength: number;
  starburstThickness: number;
  label: string;
  status: "past" | "present" | "future";
  pastLabelColor: string;
  presentLabelColor: string;
  futureLabelColor: string;
  futureTickColor: string;
  backgroundColor: string;
}) {
  const statusIndex = { past: 0, present: 1, future: 2 }[status];
  const animatedColor = useTransitioningValue({
    value: statusIndex,
    timing: {
      type: "timing",
      duration: 50,
      useNativeDriver: false,
    },
  }).interpolate({
    inputRange: [0, 1, 2],
    outputRange: [pastLabelColor, presentLabelColor, futureLabelColor],
  });

  const rayTickWidth = status === "future" ? starburstThickness : 2;

  return (
    <>
      <View
        style={{
          backgroundColor:
            status === "future" ? futureTickColor : backgroundColor,
          position: "absolute",
          borderRadius:
            status === "future" ? starburstThickness / 2 : undefined,
          left: rayLength - rayTickWidth / 2 - 1, // Not sure why the - 1 is required here.
          height: starburstThickness,
          width: rayTickWidth,
        }}
      />

      <View
        style={{
          position: "absolute",
          left: rayLength - 25,
          top: starburstThickness + layout.gridUnit,
          width: 50,
        }}
      >
        <Animated.Text
          style={useMemo(
            () => [
              type.labelTiny.layoutStyle,
              { color: animatedColor, textAlign: "center" },
            ],
            [animatedColor],
          )}
          selectable={false}
        >
          {label}
        </Animated.Text>
      </View>
    </>
  );
});

export interface StarburstLegendProps {
  config: SpacedRepetitionSchedulerConfiguration;
  activeInterval: number; // [0, 1], same as StarburstEntry.length
  starburstThickness: number;
  starburstRadius: number;
  starburstQuillOuterRadius: number;

  pastLabelColor: string;
  presentLabelColor: string;
  futureLabelColor: string;
  futureTickColor: string;
  backgroundColor: string;
}

export default React.memo(function StarburstLegend({
  config,
  activeInterval,
  starburstQuillOuterRadius,
  starburstRadius,
  starburstThickness,
  pastLabelColor,
  presentLabelColor,
  futureLabelColor,
  futureTickColor,
  backgroundColor,
}: StarburstLegendProps) {
  const sequence = generateIntervalSequence(config).slice(1);
  const nextSequenceIndex = sequence.findIndex(
    ({ interval }) => interval > activeInterval * 1.1,
  );
  const currentSequenceIndex =
    nextSequenceIndex === -1 ? sequence.length - 1 : nextSequenceIndex - 1;

  return (
    <View
      style={{ overflow: "hidden", width: "100%", height: layout.gridUnit * 3 }}
    >
      {sequence.map(({ interval, label }, index) => (
        <StarburstLegendEntry
          key={index}
          rayLength={Math.round(
            getStarburstRayLength(
              getStarburstRayValueForInterval(interval, config),
              starburstQuillOuterRadius,
              starburstRadius,
            ),
          )}
          starburstThickness={starburstThickness}
          status={
            index < currentSequenceIndex
              ? "past"
              : index === currentSequenceIndex
                ? "present"
                : "future"
          }
          label={label}
          pastLabelColor={pastLabelColor}
          presentLabelColor={presentLabelColor}
          futureLabelColor={futureLabelColor}
          futureTickColor={futureTickColor}
          backgroundColor={backgroundColor}
        />
      ))}
    </View>
  );
});
