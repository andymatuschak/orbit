import React from "react";
import { Alert } from "react-native";
import * as Updates from "expo-updates";
import type { MenuItemSpec } from "../ui/index.js";

/** Download in the background; applying code always requires an explicit choice. */
export default function useAppUpdateMenuItem(
  canReload: () => boolean,
): MenuItemSpec {
  const [pending, setPending] = React.useState(false);
  const active = React.useRef(true);
  const inFlight = React.useRef(false);
  React.useEffect(() => {
    active.current = true;
    console.log("[Orbit Lab] Application code", {
      updateID: Updates.updateId,
      embedded: Updates.isEmbeddedLaunch,
      runtimeVersion: Updates.runtimeVersion,
      updatesEnabled: Updates.isEnabled,
    });
    return () => {
      active.current = false;
    };
  }, []);

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        if (active.current) Alert.alert("Orbit Lab is up to date");
        return;
      }
      await Updates.fetchUpdateAsync();
      if (!active.current) return;
      Alert.alert(
        "App update ready",
        "Reload now, or keep reviewing and use the update on the next launch?",
        [
          { text: "Later", style: "cancel" },
          {
            text: "Reload now",
            onPress: () => {
              if (!canReload()) {
                Alert.alert(
                  "Review is still saving",
                  "Wait until the review is saved, then check for the update again.",
                );
                return;
              }
              void Updates.reloadAsync().catch(() => {
                if (active.current)
                  Alert.alert(
                    "Could not reload",
                    "The downloaded update will be available on the next launch.",
                  );
              });
            },
          },
        ],
      );
    } catch {
      if (active.current)
        Alert.alert(
          "Could not check for an update",
          "Your current app and cached reviews remain available. Check that the laptop is reachable and try again.",
        );
    } finally {
      inFlight.current = false;
      if (active.current) setPending(false);
    }
  }

  return {
    title: pending ? "Checking for app update…" : "Check for app update",
    disabled: pending || !Updates.isEnabled,
    action: () => void check(),
  };
}
