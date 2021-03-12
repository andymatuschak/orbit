import { Platform } from "react-native";

let _supportsLoginTokenBroadcastChannel: boolean | null = null;
export function supportsLoginTokenBroadcastChannel(): boolean {
  if (_supportsLoginTokenBroadcastChannel === null) {
    if (Platform.OS === "web" && typeof BroadcastChannel === "function") {
      try {
        new BroadcastChannel("loginToken");
        _supportsLoginTokenBroadcastChannel = true;
      } catch {
        // When Firefox is running with paranoid settings, BroadcastChannel is present but throws on construction.
        _supportsLoginTokenBroadcastChannel = false;
      }
    } else {
      _supportsLoginTokenBroadcastChannel = false;
    }
  }
  return _supportsLoginTokenBroadcastChannel;
}

export function createLoginTokenBroadcastChannel(): BroadcastChannel | null {
  if (supportsLoginTokenBroadcastChannel()) {
    return new BroadcastChannel("loginToken");
  } else {
    return null;
  }
}
