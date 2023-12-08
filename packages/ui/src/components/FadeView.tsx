import React, { useMemo } from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";
import { useTransitioningValue } from "./hooks/useTransitioningValue.js";

export interface FadeViewProps {
  isVisible: boolean;

  children: React.ReactNode;
  removeFromLayoutWhenHidden?: boolean; // default: no
  durationMillis?: number;
  delayMillis?: number;
  style?: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  onTransitionEnd?: (toVisible: boolean, didFinish: boolean) => void;
}

const defaultDurationMillis = 150;

export default function FadeView(props: FadeViewProps) {
  const {
    isVisible,
    durationMillis = defaultDurationMillis,
    onTransitionEnd,
    delayMillis = 0,
    removeFromLayoutWhenHidden,
    style,
  } = props;

  const [lastCompletedVisibility, setLastCompletedVisibility] =
    React.useState<boolean>(props.isVisible);

  const opacity = useTransitioningValue({
    value: isVisible ? 1 : 0,
    timing: {
      type: "timing",
      easing: Easing.linear,
      duration: durationMillis,
      delay: delayMillis,
      useNativeDriver: true,
    },
    onEndCallback: ({ finished }) => {
      setLastCompletedVisibility(isVisible);
      return onTransitionEnd?.(isVisible, finished);
    },
  });

  const shouldRemoveFromLayout =
    !lastCompletedVisibility && !isVisible && removeFromLayoutWhenHidden;

  return (
    <Animated.View
      style={useMemo(
        () => [
          style,
          {
            opacity,
            ...(!isVisible && { pointerEvents: "none" }),
            ...(shouldRemoveFromLayout && { display: "none" }),
          },
        ],
        [isVisible, opacity, shouldRemoveFromLayout, style],
      )}
    >
      {props.children}
    </Animated.View>
  );
}
