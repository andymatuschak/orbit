import { useTransitioningValue } from "metabook-ui";
import { cardWidth } from "metabook-ui/dist/components/Card";
import Spacer from "metabook-ui/dist/components/Spacer";
import colors from "metabook-ui/dist/styles/colors";
import {
  borderRadius,
  gridUnit,
  spacing,
} from "metabook-ui/dist/styles/layout";
import React from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";

const progressBarStyles = StyleSheet.create({
  common: {
    position: "absolute",
    height: gridUnit * 3,
    top: 0,
    flexDirection: "row",
  },
  mac: {
    left: 100,
    top: 1, // hack: counteracting the safe area
    right: spacing.spacing06,
  },
  compact: {
    width: cardWidth,
  },
});

export default function ReviewSessionProgressBar(props: {
  completedTaskCount: number;
  totalTaskCount: number;
}) {
  const progressWidth = useTransitioningValue({
    value: props.completedTaskCount,
    timing: {
      type: "spring",
      bounciness: 0,
    },
    useNativeDriver: false,
  });

  return (
    <View
      style={[
        progressBarStyles.common,
        Platform.OS === "ios" && Platform.isPad
          ? progressBarStyles.mac
          : progressBarStyles.compact,
      ]} // TODO should be Catalyst-specific
    >
      <View
        style={{
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            backgroundColor: colors.key10,
            height: 15,
            width: "100%",
            borderRadius: borderRadius,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            backgroundColor: colors.key70,
            height: 15,
            width: progressWidth.interpolate({
              inputRange: [0, props.totalTaskCount],
              outputRange: ["0%", "100%"],
            }),
            borderRadius: borderRadius,
          }}
        />
      </View>
      <Spacer size={spacing.spacing06} />
      <View
        style={{
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: colors.key70,
            fontSize: 20,
            textAlign: "right",
            fontWeight: "600",
          }}
        >
          {props.totalTaskCount - props.completedTaskCount}
        </Text>
      </View>
    </View>
  );
}
