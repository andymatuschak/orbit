import { RewriteFrames } from "@sentry/integrations";
import {
  addGlobalEventProcessor,
  getCurrentHub,
  init as sentryInit,
  Integrations,
  setExtras,
  setTag,
  setTags,
  Severity,
} from "@sentry/react-native";

import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import serviceConfig from "../../serviceConfig";

const useSentryInDevelopment = true;

/**
 * Expo bundles are hosted on cloudfront. Expo bundle filename will change
 * at some point in the future in order to be able to delete this code.
 */
function isPublishedExpoUrl(url: string) {
  return url.includes("https://d1wp6m56sqw74a.cloudfront.net");
}

function normalizeUrl(url: string) {
  if (isPublishedExpoUrl(url)) {
    return `app:///main.${Platform.OS}.bundle`;
  } else {
    return url;
  }
}

class ExpoIntegration {
  static id = "ExpoIntegration";
  name = ExpoIntegration.id;

  setupOnce() {
    console.log("SETTING UP EXPO INTEGRATION");
    setExtras({
      manifest: Constants.manifest,
      deviceYearClass: Constants.deviceYearClass,
      linkingUri: Constants.linkingUri,
    });

    setTags({
      deviceId: Constants.installationId,
      appOwnership: Constants.appOwnership,
      platform: Platform.OS,
    });

    if (!!Constants.manifest) {
      setTag("expoReleaseChannel", Constants.manifest.releaseChannel);
      setTag("appVersion", Constants.manifest.version ?? "");
      setTag("appPublishedTime", Constants.manifest.publishedTime);
      setTag("expoSdkVersion", Constants.manifest.sdkVersion ?? "");
    }

    if (Constants.sdkVersion) {
      setTag("expoSdkVersion", Constants.sdkVersion);
    }

    const defaultHandler = ErrorUtils.getGlobalHandler();

    ErrorUtils.setGlobalHandler((error, isFatal) => {
      // On Android, the Expo bundle filepath cannot be handled by TraceKit,
      // so we normalize it to use the same filepath that we use on Expo iOS.
      if (Platform.OS === "android") {
        error.stack = error.stack.replace(
          /\/.*\/\d+\.\d+.\d+\/cached\-bundle\-experience\-/g,
          "https://d1wp6m56sqw74a.cloudfront.net:443/",
        );
      }

      getCurrentHub().withScope((scope) => {
        if (isFatal) {
          scope.setLevel(Severity.Fatal);
        }
        getCurrentHub().captureException(error, {
          originalException: error,
        });
      });

      const client = getCurrentHub().getClient();
      if (client && !__DEV__) {
        client.flush(client.getOptions().shutdownTimeout || 2000).then(() => {
          defaultHandler(error, isFatal);
        });
      } else {
        // If there is no client, something is fishy but we call the default handler anyway. Even if in dev
        defaultHandler(error, isFatal);
      }
    });

    addGlobalEventProcessor(function (event, _hint) {
      const that = getCurrentHub().getIntegration(ExpoIntegration);

      if (that) {
        event.contexts = {
          ...(event.contexts || {}),
          device: {
            simulator: !Device.isDevice,
            model: Device.modelName,
          },
          os: {
            name: Device.osName,
            version: Device.osVersion,
          },
        };
      }

      return event;
    });
  }
}

// Adapted from sentry-expo.
const integrations = [
  new Integrations.ReactNativeErrorHandlers({
    onerror: false,
    onunhandledrejection: true,
  }),
  new ExpoIntegration(),
  new RewriteFrames({
    iteratee: (frame) => {
      if (frame.filename) {
        frame.filename = normalizeUrl(frame.filename);
      }
      return frame;
    },
  }),
];

export function initializeReporter() {
  const release = !!Constants.manifest
    ? Constants.manifest.revisionId || "UNVERSIONED"
    : Date.now().toString();

  // Bail out automatically if the app isn't deployed
  const enabled = !__DEV__ || useSentryInDevelopment;
  if (!enabled) {
    console.log("[sentry] Disabling Sentry in development");
  }

  sentryInit({
    dsn: serviceConfig.sentryDSN,
    enableAutoSessionTracking: true,
    enabled,
    release,
    integrations,
  });
}
