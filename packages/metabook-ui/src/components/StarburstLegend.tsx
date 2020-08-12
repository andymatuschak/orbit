import { getIntervalSequenceForSchedule } from "metabook-core";
import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { layout, type } from "../styles";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import {
  getStarburstRayLength,
  getStarburstRayValueForInterval,
} from "./Starburst";

function StarburstLegendEntry({
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
      duration: 100,
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
          style={[
            type.caption.layoutStyle,
            { color: animatedColor, textAlign: "center" },
          ]}
          selectable={false}
        >
          {label}
        </Animated.Text>
      </View>
    </>
  );
}

export interface StarburstLegendProps {
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

export default function StarburstLegend({
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
  const sequence = getIntervalSequenceForSchedule("default").slice(1);
  console.log(activeInterval / (1000 * 60 * 60 * 24));
  const nextSequenceIndex = sequence.findIndex(
    ({ interval }) => interval > activeInterval * 1.1,
  );
  const currentSequenceIndex =
    nextSequenceIndex === -1 ? sequence.length - 1 : nextSequenceIndex - 1;

  return (
    <>
      {sequence.map(({ interval, label }, index) => (
        <StarburstLegendEntry
          key={index}
          rayLength={Math.round(
            getStarburstRayLength(
              getStarburstRayValueForInterval(interval),
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
    </>
  );
}
