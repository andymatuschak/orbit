import { useEffect, useEffectEvent } from "react";
import { Platform } from "react-native";

type KeydownEvent = {
  key: string;
  repeat: boolean;
};

export function useKeyDown(onKeyDown: (event: KeydownEvent) => void) {
  const handleKeyDown = useEffectEvent(onKeyDown);

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}
