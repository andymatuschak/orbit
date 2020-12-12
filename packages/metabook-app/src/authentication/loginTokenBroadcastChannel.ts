import { Platform } from "react-native";

let _loginTokenBroadcastChannel:
  | BroadcastChannel
  | null
  | undefined = undefined;

export function getLoginTokenBroadcastChannel(): BroadcastChannel | null {
  if (_loginTokenBroadcastChannel === undefined) {
    if (Platform.OS === "web" && typeof BroadcastChannel === "function") {
      try {
        _loginTokenBroadcastChannel = new BroadcastChannel("loginToken");
      } catch {
        // When Firefox is running with paranoid settings, BroadcastChannel is present but throws on construction.
        _loginTokenBroadcastChannel = null;
      }
    } else {
      _loginTokenBroadcastChannel = null;
    }
  }
  return _loginTokenBroadcastChannel;
}
