import React from "react";
import {
  ButtonProps,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import colors from "../styles/colors";
import { borderRadius, gridUnit, spacing } from "../styles/layout";
import type from "../styles/type";

export default function BigButton(
  props: {
    variant?: "primary" | "secondary";
    extraStyles?: StyleProp<ViewStyle>;
  } & ButtonProps,
) {
  const effectiveVariant = props.variant ?? "primary";
  return (
    <TouchableOpacity {...props} activeOpacity={0.6} style={props.extraStyles}>
      <View
        style={{
          backgroundColor:
            effectiveVariant === "primary" ? colors.key70 : "transparent",
          height: gridUnit * 3,
          borderRadius: borderRadius,
          flexDirection: "row",
          justifyContent: "center",
          paddingLeft: spacing.spacing05,
          paddingRight: spacing.spacing05,
          paddingTop: spacing.spacing05,
          paddingBottom: spacing.spacing05,
          opacity: props.disabled ? 0.1 : 1.0,
        }}
      >
        <Text
          style={{
            color: effectiveVariant === "primary" ? colors.key00 : colors.key70,
            ...type.label,
            fontWeight: "600",
          }}
          selectable={false}
        >
          {props.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
