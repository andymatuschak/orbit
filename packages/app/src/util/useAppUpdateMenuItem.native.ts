import React from "react";
import { Alert, AppState, Linking } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import type { MenuItemSpec } from "../ui/index.js";
import { checkNativeAppUpdate } from "./nativeAppUpdate.js";
import { AppUpdateController, type AppUpdate } from "./appUpdateController.js";

/** Foreground checks offer updates immediately; applying code needs approval. */
export default function useAppUpdateMenuItem(canReload: () => boolean): {
  menuItem: MenuItemSpec;
  writesFinished(): void;
} {
  const [pending, setPending] = React.useState(false);
  const policy = React.useRef(canReload);
  policy.current = canReload;
  const checks = React.useRef<AppUpdateController | null>(null);
  React.useEffect(() => {
    let mounted = true;
    console.log("[Orbit Lab] Application code", {
      updateID: Updates.updateId,
      embedded: Updates.isEmbeddedLaunch,
      runtimeVersion: Updates.runtimeVersion,
      updatesEnabled: Updates.isEnabled,
    });
    const controller = new AppUpdateController({
      checkNative: () =>
        checkNativeAppUpdate(Constants.expoConfig?.extra?.labOrigin, {
          bundleIdentifier: Application.applicationId,
          buildNumber: Application.nativeBuildVersion,
        }),
      checkJavaScript: async () => {
        if (!Updates.isEnabled) return null;
        const update = await Updates.checkForUpdateAsync();
        return update.isAvailable ? update.manifest.id : null;
      },
      fetchJavaScript: async () => {
        await Updates.fetchUpdateAsync();
      },
      canReload: () => policy.current(),
      setChecking: setPending,
      showUpdate,
      showCurrent: () => Alert.alert("Orbit Lab is up to date"),
      showError: () =>
        Alert.alert(
          "Could not check for an update",
          "Your current app and cached reviews remain available. Check that the laptop is reachable and try again.",
        ),
    });
    checks.current = controller;

    function showUpdate(update: AppUpdate, onDismiss: () => void) {
      const apply = () => {
        onDismiss();
        if (!mounted || AppState.currentState !== "active") return;
        // Recheck at the actual reload/install tap, not just at discovery.
        if (!policy.current()) {
          Alert.alert(
            "Review is still saving",
            "Wait until the review is saved, then check for the update again.",
          );
          return;
        }
        const action =
          update.kind === "native"
            ? Linking.openURL(
                `itms-services://?action=download-manifest&url=${encodeURIComponent(update.release.manifestURL)}`,
              )
            : Updates.reloadAsync();
        void action.catch(() => {
          if (!mounted || AppState.currentState !== "active") return;
          Alert.alert(
            update.kind === "native"
              ? "Could not start installation"
              : "Could not reload",
            update.kind === "native"
              ? "Check that the laptop is reachable and try again. Your current app and reviews have not been changed."
              : "The downloaded update will be available on the next launch.",
          );
        });
      };
      if (update.kind === "native") {
        Alert.alert(
          "New app build available",
          `Install Orbit Lab ${update.release.version} (${update.release.buildNumber})? iOS will ask you to confirm the installation.`,
          [
            { text: "Later", style: "cancel", onPress: onDismiss },
            { text: "Install", onPress: apply },
          ],
          { onDismiss },
        );
      } else {
        Alert.alert(
          "App update ready",
          "Reload now, or keep reviewing and use the update on the next launch?",
          [
            { text: "Later", style: "cancel", onPress: onDismiss },
            { text: "Reload now", onPress: apply },
          ],
          { onDismiss },
        );
      }
    }

    const subscription = AppState.addEventListener("change", (state) =>
      controller.setAppState(state),
    );
    controller.setAppState(AppState.currentState);
    return () => {
      mounted = false;
      subscription.remove();
      controller.close();
      checks.current = null;
    };
  }, []);

  return {
    menuItem: {
      title: pending ? "Checking for app update…" : "Check for app update",
      disabled: pending,
      action: () => void checks.current?.check(true),
    },
    writesFinished: () => checks.current?.idle(),
  };
}
