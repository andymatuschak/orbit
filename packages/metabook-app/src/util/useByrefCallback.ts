import { useWeakRef } from "metabook-ui";
import { useCallback } from "react";

export default function useByrefCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = useWeakRef(callback);
  return useCallback(
    (...args: Args) => {
      return callbackRef.current(...args);
    },
    [callbackRef],
  );
}
