import * as Sentry from "@sentry/browser";
import GitInfo from "react-git-info/macro";
import serviceConfig from "../../serviceConfig";

const useSentryInDevelopment = true;

export function initializeReporter() {
  Sentry.init({
    dsn: serviceConfig.sentryDSN,
    enabled: !__DEV__ || useSentryInDevelopment,
    release: `${serviceConfig.sentryProject}@${GitInfo().commit.hash}`,
  });
  Sentry.setTags({
    platform: "web",
  });
}
