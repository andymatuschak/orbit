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
  delayMillis?: number;
  style?: WithAnimatedValue<StyleProp<ViewStyle>>;
  onTransitionEnd?: (toVisible: boolean, didFinish: boolean) => void;
  // TODO: implement unmountOnExit etc
}

const defaultDurationMillis = 150;

export default function FadeView(props: FadeViewProps) {
  const {
    isVisible,
    durationMillis,
    onTransitionEnd,
    delayMillis,
    style,
  } = props;

  const opacity = useTransitioningValue({
    value: isVisible ? 1 : 0,
    timing: {
      type: "timing",
      easing: Easing.linear,
      duration: durationMillis || defaultDurationMillis,
      delay: delayMillis || 0,
      useNativeDriver: true,
    },
    onEndCallback: ({ finished }) => onTransitionEnd?.(isVisible, finished),
  });

  return (
    <Animated.View
      style={React.useMemo(
        () => [
          style,
          {
            opacity,
          },
        ],
        [style, opacity],
      )}
    >
      {props.children}
    </Animated.View>
  );
}
