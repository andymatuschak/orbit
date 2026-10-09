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

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"
firebase_app_id="${ORBIT_FIREBASE_IOS_APP_ID:-1:748053153064:ios:7583e31781730aff12bc1d}"
testers="${ORBIT_ADHOC_TESTERS:-andy@andymatuschak.org}"

"$script_directory/run_ios_release_preflight.sh"
candidate_commit="$(git -C "$repository_directory" rev-parse --short HEAD)"

artifact_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-adhoc.XXXXXX")"
trap 'rm -rf -- "$artifact_directory"' EXIT
artifact_path="$artifact_directory/Orbit.ipa"

cd -- "$script_directory/.."
npx --yes eas-cli@24.3.0 build \
  --platform ios \
  --profile dogfood-adhoc \
  --local \
  --output "$artifact_path"

release_notes="Orbit dogfood $candidate_commit, built $(date -u +%Y-%m-%dT%H:%M:%SZ)"
npx --yes firebase-tools@latest appdistribution:distribute "$artifact_path" \
  --project metabook-system \
  --account "${ORBIT_FIREBASE_ACCOUNT:-andy@andymatuschak.org}" \
  --app "$firebase_app_id" \
  --testers "$testers" \
  --release-notes "$release_notes"
