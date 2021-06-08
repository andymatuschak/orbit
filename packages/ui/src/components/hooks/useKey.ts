import React, { useEffect } from "react";
import { Platform } from "react-native";

export type KeyboardEvent = React.KeyboardEvent;

export function useKeyDown(onKeyDown: (event: KeyboardEvent) => void) {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);
}
