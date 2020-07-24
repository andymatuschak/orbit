import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import unreachableCaseError from "../../util/unreachableCaseError";
import useWeakRef from "./useWeakRef";

export type AnimationSpec =
  | ({ type: "timing" } & Omit<Animated.TimingAnimationConfig, "toValue">)
  | ({ type: "spring" } & Omit<Animated.SpringAnimationConfig, "toValue">);

export function useTransitioningValue({
  value,
  timing,
  onEndCallback,
}: {
  value: number;
  timing: AnimationSpec;
  onEndCallback?: Animated.EndCallback;
}): Animated.Value {
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
