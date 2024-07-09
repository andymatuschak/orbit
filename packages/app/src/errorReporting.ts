import * as Sentry from "@sentry/react-native";
import serviceConfig from "../serviceConfig.js";

const useSentryInDevelopment = false;

export function initializeReporter() {
  Sentry.init({
    dsn: serviceConfig.sentryDSN,
    enabled: useSentryInDevelopment,
    debug: __DEV__,
  });
}
