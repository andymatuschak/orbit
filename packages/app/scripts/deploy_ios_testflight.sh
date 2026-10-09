#!/usr/bin/env bash

set -euo pipefail

# Xcode's IPA exporter invokes Apple's rsync with Apple-specific flags, then
# resolves its helper through PATH. Prefer the matching system binary over a
# Homebrew rsync installation.
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# EAS CLI 24.3's optional fingerprint step currently fails with the workspace's
# resolved brace-expansion package. The local archive itself is deterministic
# without that metadata step.
export EAS_SKIP_AUTO_FINGERPRINT="${EAS_SKIP_AUTO_FINGERPRINT:-1}"

build_profile="${1:-production}"
if [[ "$build_profile" != "production" && "$build_profile" != "dogfood" ]]; then
  echo "Usage: $0 [production|dogfood]" >&2
  exit 64
fi

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"

# A TestFlight upload is too slow to serve as the integration test for the
# local-first review acknowledgement boundary. Keep this focused preflight in
# the release path: it proves that the hosted review facade acknowledges its
# local vault write without waiting for sync, reminders, or WidgetKit, and it
# exercises the native widget projection writer independently.
"$script_directory/run_ios_release_preflight.sh"

artifact_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-testflight.XXXXXX")"
trap 'rm -rf -- "$artifact_directory"' EXIT
artifact_path="$artifact_directory/Orbit.ipa"

npx --yes eas-cli@24.3.0 build \
  --platform ios \
  --profile "$build_profile" \
  --local \
  --output "$artifact_path"

npx --yes eas-cli@24.3.0 submit \
  --platform ios \
  --profile "$build_profile" \
  --path "$artifact_path" \
  --auto-testflight-setup
