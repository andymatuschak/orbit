import { BrowserOptions } from "@sentry/browser";
import GitInfo from "react-git-info/macro";
import serviceConfig from "../../serviceConfig";

declare global {
  const Sentry: {
    onLoad(callback: () => void): void;
    init(options: BrowserOptions): void;
    setTags(tags: { [key: string]: string }): void;
  };
}

const useSentryInDevelopment = false;

export function initializeReporter() {
  // Bail out automatically if the app isn't deployed
  const enabled = !__DEV__ || useSentryInDevelopment;
  if (!enabled) {
    console.log("[sentry] Disabling Sentry in development");
  }
  try {
    Sentry.onLoad(() => {
      Sentry.init({
        enabled,
        release: `${serviceConfig.sentryProject}@${GitInfo().commit.hash}`,
      });
      Sentry.setTags({
        platform: "web",
      });
    });
  } catch (e) {
    console.error("[sentry] Failed to load Sentry");
  }
}
