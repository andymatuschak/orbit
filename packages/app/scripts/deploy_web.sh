export SENTRY_AUTH_TOKEN=$(firebase functions:config:get sentry.auth_token | sed -e "s/\"//g")
export SENTRY_ORG=$(bun -e "import serviceConfig from './serviceConfig.js'; console.log(serviceConfig.sentryOrg)")
export SENTRY_PROJECT=$(bun -e "import serviceConfig from './serviceConfig.js'; console.log(serviceConfig.sentryProject)")
# The web artifact is shared by every account, so keep this schema-2 experiment
# enabled only for Andy's Firebase identity. Everyone else continues through
# the legacy database path until the hosted service is ready for a wider cohort.
export EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC=true
export EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS=x5EWk2UT56URxbfrl7djoxwxiqH2
export EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN=https://136-69-77-9.sslip.io
VERSION=$(sentry-cli releases propose-version)

sentry-cli releases -o "$SENTRY_ORG" new -p "$SENTRY_PROJECT" "$VERSION"
sentry-cli releases -o "$SENTRY_ORG" set-commits --auto "$VERSION"

bun run build:web
if ! rg -q --glob '*.js' --glob '!*.js.map' \
  "$EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN" web-build; then
  echo "Web artifact does not contain the configured hosted-sync origin" >&2
  exit 1
fi
if ! rg -q --glob '*.js' --glob '!*.js.map' \
  "$EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS" web-build; then
  echo "Web artifact does not contain the configured hosted-sync cohort" >&2
  exit 1
fi
bunx firebase deploy --only hosting

sentry-cli releases -o "$SENTRY_ORG" files "$VERSION" upload-sourcemaps --no-rewrite ./web-build/static/js
sentry-cli releases -o "$SENTRY_ORG" finalize "$VERSION"
sentry-cli releases -o "$SENTRY_ORG" deploys "$VERSION" new -e production
