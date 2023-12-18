import { useWeakRef } from "@withorbit/ui";
import { useCallback } from "react";

// Returns a fixed function reference which calls the most recent value of `callback`. Useful for avoiding excess dependencies or recomputations in React hooks around callbacks.
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
