export SENTRY_AUTH_TOKEN=$(firebase functions:config:get sentry.auth_token | sed -e "s/\"//g")
export SENTRY_ORG=$(node -p --input-type="module" -e "import serviceConfig from './serviceConfig.mjs'; serviceConfig.sentryOrg")
export SENTRY_PROJECT=$(node -p --input-type="module" -e "import serviceConfig from './serviceConfig.mjs'; serviceConfig.sentryProject")
VERSION=$(sentry-cli releases propose-version)

sentry-cli releases -o "$SENTRY_ORG" new -p "$SENTRY_PROJECT" "$VERSION"
sentry-cli releases -o "$SENTRY_ORG" set-commits --auto "$VERSION"

yarn run build:web
npx firebase deploy

sentry-cli releases -o "$SENTRY_ORG" files "$VERSION" upload-sourcemaps --no-rewrite ./web-build/static/js
sentry-cli releases -o "$SENTRY_ORG" finalize "$VERSION"
sentry-cli releases -o "$SENTRY_ORG" deploys "$VERSION" new -e production
