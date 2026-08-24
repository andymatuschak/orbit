import { NativeModule, requireOptionalNativeModule } from "expo";
import { useEffect, useEffectEvent } from "react";

type KeydownEvent = {
  key: string;
  repeat: boolean;
};

type OrbitHardwareKeyboardEvents = {
  onKeyDown: (event: KeydownEvent) => void;
};

declare class OrbitHardwareKeyboardModule extends NativeModule<OrbitHardwareKeyboardEvents> {}

const hardwareKeyboard =
  requireOptionalNativeModule<OrbitHardwareKeyboardModule>(
    "OrbitHardwareKeyboard",
  );

export function useKeyDown(onKeyDown: (event: KeydownEvent) => void) {
  const handleKeyDown = useEffectEvent(onKeyDown);

  useEffect(() => {
    if (!hardwareKeyboard) return;

    const subscription = hardwareKeyboard.addListener(
      "onKeyDown",
      handleKeyDown,
    );
    return () => subscription.remove();
  }, []);
}
