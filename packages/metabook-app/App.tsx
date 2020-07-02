import "expo-asset";
import React from "react";
import { NativeEventEmitter, NativeModules } from "react-native";
import { initializeReporter } from "./src/errorReporting/reporter";

import Root from "./src/Root";
import "./src/util/shimBase64";

export default function App() {
  React.useEffect(() => {
    initializeReporter();

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
