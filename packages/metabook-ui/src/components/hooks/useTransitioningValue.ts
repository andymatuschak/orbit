import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import unreachableCaseError from "../../util/unreachableCaseError";
import useWeakRef from "./useWeakRef";

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
      let animation: Animated.CompositeAnimation;
      if (timing.type === "timing") {
        animation = Animated.timing(animatedValue.current, {
          ...timing,
          toValue: value,
        });
      } else if (timing.type === "spring") {
        animation = Animated.spring(animatedValue.current, {
          ...timing,
          toValue: value,
        });
      } else {
        throw unreachableCaseError(timing);
      }
      animation.start(onEndCallback);
    }
    oldValue.current = value;
  }, [onEndCallbackRef, timingRef, value]);

  return animatedValue.current;
}

export function useTransitioningColorValue({
  value,
  timing,
  onEndCallback,
}: AnimatedTransitionConfig<string>): Animated.AnimatedInterpolation {
  // This implementation will "jump" in color if interrupted, rather than smoothly redirecting the old animation to the new one. To do that, I think we'd have to use a complex scheme of additive animations.

  const animatedValue = useRef(new Animated.Value(0));
  const previousColor = useRef<string>();
  const currentColor = useRef<string>();

  if (currentColor.current !== undefined && currentColor.current !== value) {
    let animation: Animated.CompositeAnimation;
    animatedValue.current = new Animated.Value(0);

    if (timing.type === "timing") {
      animation = Animated.timing(animatedValue.current, {
        ...timing,
        toValue: 1,
      });
    } else if (timing.type === "spring") {
      animation = Animated.spring(animatedValue.current, {
        ...timing,
        toValue: 1,
      });
    } else {
      throw unreachableCaseError(timing);
    }
    animation.start(onEndCallback);
    previousColor.current = currentColor.current;
  }
  currentColor.current = value;

  if (previousColor.current) {
    return animatedValue.current.interpolate({
      inputRange: [0, 1],
      outputRange: [previousColor.current, value],
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
