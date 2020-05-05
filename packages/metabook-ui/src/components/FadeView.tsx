import React from "react";
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import WithAnimatedValue = Animated.WithAnimatedValue;

export interface FadeViewProps {
  isVisible: boolean;

  children?: React.ReactNode;
  durationMillis?: number;
  style?: WithAnimatedValue<StyleProp<ViewStyle>>;
  onTransitionEnd?: (toVisible: boolean, didFinish: boolean) => void;
  // TODO: implement unmountOnExit etc
}

const defaultDurationMillis = 150;

export default function FadeView(props: FadeViewProps) {
  const { isVisible, durationMillis, onTransitionEnd } = props;

  const opacity = useTransitioningValue({
    value: isVisible ? 1 : 0,
    timing: {
      type: "timing",
      easing: Easing.linear,
      duration: durationMillis || defaultDurationMillis,
    },
    onEndCallback: ({ finished }) => onTransitionEnd?.(isVisible, finished),
  });

  return (
    <Animated.View
      {...props}
      style={
        StyleSheet.compose(props.style || [], ({
          opacity,
        } as unknown) as StyleProp<ViewStyle>) as WithAnimatedValue<
          StyleProp<ViewStyle>
        > // HACK: Taking advantage of the fact that StyleSheet.compose can work with animated values, even though its type doesn't claim it can.
      }
    >
      {props.children}
    </Animated.View>
  );
}
