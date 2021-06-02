import React from "react";
import { useEffect } from "react";
import { Platform } from "react-native";

export type KeyboardEvent = React.KeyboardEvent;

export function useKeyDown(
  onKeyDown: (event: KeyboardEvent) => void,
  deps = [] as any[],
) {
  useEffect(() => {
    if (Platform.OS !== "web") return () => {};

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown, ...deps]);
}

interface Options {
  disabled?: boolean;
  disableRepeat?: boolean;
}

export default function useKey(
  key: string,
  handler: () => void,
  options: Options = { disabled: false, disableRepeat: true },
) {
  useKeyDown((event) => {
    if (
      key !== event.key ||
      (options.disableRepeat && event.repeat) ||
      options.disabled
    ) {
      return;
    } else {
      handler();
    }
  });
}
