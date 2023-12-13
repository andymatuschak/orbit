import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import unreachableCaseError from "../../util/unreachableCaseError.js";
import useWeakRef from "./useWeakRef.js";

export type AnimatedTransitionTiming =
  | ({ type: "timing" } & Omit<Animated.TimingAnimationConfig, "toValue">)
  | ({ type: "spring" } & Omit<Animated.SpringAnimationConfig, "toValue">);

type AnimatedTransitionConfig<T> = {
  value: T;
  timing: AnimatedTransitionTiming;
  onEndCallback?: Animated.EndCallback;
};

export function useTransitioningValue({
  value,
  timing,
  onEndCallback,
}: AnimatedTransitionConfig<number>): Animated.Value {
  const animatedValue = useRef(new Animated.Value(value));
  const oldValue = useRef<number>();

  const timingRef = useWeakRef(timing);
  const onEndCallbackRef = useWeakRef(onEndCallback);

  useEffect(() => {
    const timing = timingRef.current;
    const onEndCallback = onEndCallbackRef.current;
    if (oldValue.current !== undefined && oldValue.current !== value) {
      if (timing.type === "timing") {
        Animated.timing(animatedValue.current, {
          ...timing,
          toValue: value,
        }).start(onEndCallback);
      } else if (timing.type === "spring") {
        Animated.spring(animatedValue.current, {
          ...timing,
          toValue: value,
        }).start(onEndCallback);
      } else {
        throw unreachableCaseError(timing);
      }
    }
    oldValue.current = value;
  }, [onEndCallbackRef, timingRef, value]);

  return animatedValue.current;
}

export function useTransitioningColorValue({
  value,
  timing,
  onEndCallback,
}: AnimatedTransitionConfig<string>): Animated.AnimatedInterpolation<string> {
  // This implementation will "jump" in color if interrupted, rather than smoothly redirecting the old animation to the new one. To do that, I think we'd have to use a complex scheme of additive animations.

  const animatedValue = useRef(new Animated.Value(0));
  const fromColor = useRef<string>();
  const targetColor = useRef<string>();

  // It's not great to have side effects on render like this, but unfortunately, I don't see how to implement this with useEffect without creating jumps.
  if (targetColor.current !== undefined && targetColor.current !== value) {
    animatedValue.current = new Animated.Value(0);
    if (timing.type === "timing") {
      Animated.timing(animatedValue.current, {
        ...timing,
        toValue: 1,
      }).start(onEndCallback);
    } else if (timing.type === "spring") {
      Animated.spring(animatedValue.current, {
        ...timing,
        toValue: 1,
      }).start(onEndCallback);
    } else {
      throw unreachableCaseError(timing);
    }
    fromColor.current = targetColor.current;
  }
  targetColor.current = value;

  if (fromColor.current) {
    return animatedValue.current.interpolate({
      inputRange: [0, 1],
      outputRange: [fromColor.current, value],
      extrapolate: "clamp",
    });
  } else {
    return animatedValue.current.interpolate({
      inputRange: [0, 1],
      outputRange: [value, value],
      extrapolate: "clamp",
    });
  }
}
