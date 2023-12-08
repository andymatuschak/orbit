import React from "react";
import serviceConfig from "../../serviceConfig.js";

function trackPageView(pathname: string, referrer: string | null) {
  const {
    screen: { width, height },
    navigator: { language },
  } = window;

  const payload = {
    pathname,
    referrer,
    hostname: window.location.hostname,
    screen: `${width}x${height}`,
    language,
  };

  fetch(`${serviceConfig.httpsAPIBaseURLString}/internal/recordPageView`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch((error) => {
    console.error(`Error in recording page view:`, error);
  });
}

export default function usePageViewTracking() {
  // TODO: listen to history events for client-side navigation if necessary

  React.useEffect(() => {
    trackPageView(window.location.pathname, document.referrer);
  }, []);
}
