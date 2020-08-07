import React from "react";
import { Animated, Easing, StyleProp, ViewStyle } from "react-native";
import { useTransitioningValue } from "./hooks/useTransitioningValue";
import WithAnimatedValue = Animated.WithAnimatedValue;

export interface FadeViewProps {
  isVisible: boolean;

  children: React.ReactNode;
  removeFromLayoutWhenHidden?: boolean; // default: no
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
    removeFromLayoutWhenHidden,
    style,
  } = props;

  const [lastCompletedVisibility, setLastCompletedVisibility] = React.useState<
    boolean
  >(props.isVisible);

  const opacity = useTransitioningValue({
    value: isVisible ? 1 : 0,
    timing: {
      type: "timing",
      easing: Easing.linear,
      duration: durationMillis || defaultDurationMillis,
      delay: delayMillis || 0,
      useNativeDriver: true,
    },
    onEndCallback: ({ finished }) => {
      setLastCompletedVisibility(isVisible);
      return onTransitionEnd?.(isVisible, finished);
    },
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity,
          ...(!isVisible && { pointerEvents: "none" }),
          ...(!lastCompletedVisibility &&
            !isVisible &&
            removeFromLayoutWhenHidden && { display: "none" }),
        },
      ]}
    >
      {props.children}
    </Animated.View>
  );
}
