const shouldUseLocalBackend = typeof __DEV__ === "undefined" ? false : __DEV__;
// Set this to false to use the production backend in development.
const defaultHostedSyncServiceOrigin = shouldUseLocalBackend
  ? "http://127.0.0.1:8787"
  : "https://sync.withorbit.com";
const firebaseAuthEmulatorOrigin =
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_ORIGIN ??
  (shouldUseLocalBackend ? "http://localhost:9099" : null);

export default {
  sentryDSN:
    "https://7a9cba7e96b54da4bae2c6eb9b8d7b18@o240663.ingest.sentry.io/5306223",
  sentryOrg: "andy-matuschak",
  sentryProject: "orbit-app",
  // Store your auth token securely: firebase functions:config:set sentry.auth_token=SENTRY_AUTH_TOKEN

  httpsAPIBaseURLString: shouldUseLocalBackend
    ? "http://127.0.0.1:5001/metabook-system/us-central1/api"
    : "https://withorbit.com/api",
  hostedSyncServiceOrigin:
    process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN ??
    defaultHostedSyncServiceOrigin,
  // Phase 3 remains an explicit cohort gate while the hosted service is a
  // single-instance durability spike.
  hostedSyncEnabled: process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC === "true",
  hostedSyncAuthenticationUserIDs: (
    process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS ?? ""
  )
    .split(",")
    .map((value: string) => value.trim())
    .filter(Boolean),
  firebaseAuthEmulatorOrigin,
  shouldUseLocalBackend,
};
