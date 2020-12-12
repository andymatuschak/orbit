import { Platform } from "react-native";

let _loginTokenBroadcastChannel:
  | BroadcastChannel
  | null
  | undefined = undefined;

export function getLoginTokenBroadcastChannel(): BroadcastChannel | null {
  if (_loginTokenBroadcastChannel === undefined) {
    if (Platform.OS === "web" && typeof BroadcastChannel === "function") {
      _loginTokenBroadcastChannel = new BroadcastChannel("loginToken");
    } else {
      _loginTokenBroadcastChannel = null;
    }
  }
  return _loginTokenBroadcastChannel;
}
