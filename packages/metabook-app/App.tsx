import React from "react";
import "node-libs-react-native/globals";
import "./src/util/shimBase64";
import "expo-asset";
import { NativeEventEmitter, NativeModules } from "react-native";

import Root from "./src/Root";

export default function App() {
  React.useEffect(() => {
    setTimeout(() => {
      console.log("Debug manager", NativeModules.DebugManager);
      if (NativeModules.DebugManager) {
        console.log("Registering");
        const debugEventEmitter = new NativeEventEmitter(
          NativeModules.DebugManager,
        );
        const subscription = NativeEventEmitter.addListener(
          "ShowDebugMenu",
          () => {
            console.log("SHOW DEBUG MENU");
          },
        );

        return () => {
          subscription.remove();
        };
      }
    }, 1000);
  }, []);

  return <Root />;
}
