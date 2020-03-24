import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import unreachableCaseError from "../../util/unreachableCaseError";
import usePrevious from "./usePrevious";

type AnimationSpec =
  | ({ type: "timing" } & Omit<Animated.TimingAnimationConfig, "toValue">)
  | ({ type: "spring" } & Omit<Animated.SpringAnimationConfig, "toValue">);

export function useTransitioningValue(
  value: number,
  timing: AnimationSpec,
  onEndCallback?: Animated.EndCallback,
): Animated.Value {
  const animatedValue = useRef(new Animated.Value(value));
  const oldValue = usePrevious(value);
  useEffect(() => {
    if (oldValue !== undefined && oldValue !== value) {
      let animation: Animated.CompositeAnimation;
      if (timing.type === "timing") {
        animation = Animated.timing(animatedValue.current, {
          ...timing,
          toValue: value,
          useNativeDriver: true
        });
      } else if (timing.type === "spring") {
        animation = Animated.spring(animatedValue.current, {
          ...timing,
          toValue: value,
          useNativeDriver: true
        });
      } else {
        throw unreachableCaseError(timing);
      }
      animation.start(onEndCallback);
    }
  }, [value]);

  return animatedValue.current;
}