import { useEffect, useEffectEvent } from "react";

type KeydownEvent = {
  key: string;
  repeat: boolean;
};

export function useKeyDown(onKeyDown: (event: KeydownEvent) => void) {
  const handleKeyDown = useEffectEvent(onKeyDown);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      handleKeyDown(event);
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}
