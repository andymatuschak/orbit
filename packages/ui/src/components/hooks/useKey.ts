import { useEffect } from "react";
import { Platform } from "react-native";
import KeyEvent from "react-native-keyevent";

type KeydownEvent = {
  key: string;
  repeat: boolean;
};

export function useKeyDown(onKeyDown: (event: KeydownEvent) => void) {
  useEffect(() => {
    if (Platform.OS !== "web") return;

    const listener = (e: KeyboardEvent) => {
      onKeyDown(e);
    };

    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [onKeyDown]);

  useEffect(() => {
    if (!(Platform.OS === "macos" || Platform.OS === "ios")) return;
    // [27/01/21] onKeyDownListener is unimplemented for iOS. Will use onKeyUp listener for now.
    //  Related Issue: https://github.com/kevinejohn/react-native-keyevent/issues/62
    KeyEvent.onKeyUpListener((e: unknown) => {
      if (typeof e !== "object" || !e) return;

      if ("pressedKey" in e) {
        const event = e as { pressedKey: string };
        // the react-native-keyevent library does not provide the
        // repeat key, so we'll just assume it is
        onKeyDown({ key: event.pressedKey, repeat: false });
      }
    });
    return () => KeyEvent.removeKeyUpListener();
  }, [onKeyDown]);
}
