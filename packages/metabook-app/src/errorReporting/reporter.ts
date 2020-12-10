import { BrowserOptions } from "@sentry/browser";
import GitInfo from "react-git-info/macro";
import serviceConfig from "../../serviceConfig.mjs";

declare global {
  const Sentry: {
    onLoad(callback: () => void): void;
    init(options: BrowserOptions): void;
    setTags(tags: { [key: string]: string }): void;
  };
}

const useSentryInDevelopment = false;

export function initializeReporter() {
  Sentry.onLoad(() => {
    Sentry.init({
      enabled: !__DEV__ || useSentryInDevelopment,
      release: `${serviceConfig.sentryProject}@${GitInfo().commit.hash}`,
    });
    Sentry.setTags({
      platform: "web",
    });
  });
}
