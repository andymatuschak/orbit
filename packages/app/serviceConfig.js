const shouldUseLocalBackend = typeof __DEV__ === "undefined" ? false : __DEV__;
// Uncomment this line (and comment the above) to use the production backend in dev.
// const shouldUseLocalBackend = false;

module.exports = {
  sentryDSN:
    "https://7a9cba7e96b54da4bae2c6eb9b8d7b18@o240663.ingest.sentry.io/5306223",
  sentryOrg: "andy-matuschak",
  sentryProject: "orbit-app",
  // Store your auth token securely: firebase functions:config:set sentry.auth_token=SENTRY_AUTH_TOKEN

  httpsAPIBaseURLString: shouldUseLocalBackend
    ? "http://127.0.0.1:5001/metabook-system/us-central1/api"
    : "https://withorbit.com/api",
  shouldUseLocalBackend,

  appleDevelopmentTeamID: "MQ22N839N8",
};
