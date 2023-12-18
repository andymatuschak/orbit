import * as Sentry from "sentry-expo";
import serviceConfig from "../serviceConfig.js";

const useSentryInDevelopment = false;

export function initializeReporter() {
  Sentry.init({
    dsn: serviceConfig.sentryDSN,
    enableInExpoDevelopment: useSentryInDevelopment,
    debug: __DEV__,
  });
}
