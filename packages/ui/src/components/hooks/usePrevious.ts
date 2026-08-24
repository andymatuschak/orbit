import { useRef } from "react";

export default function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined);
  const { current } = ref;
  ref.current = value;
  return current;
}
