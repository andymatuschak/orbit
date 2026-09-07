#!/usr/bin/env bash

set -euo pipefail

artifact_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-testflight.XXXXXX")"
trap 'rm -rf -- "$artifact_directory"' EXIT
artifact_path="$artifact_directory/Orbit.ipa"

bunx eas-cli build \
  --platform ios \
  --profile production \
  --local \
  --output "$artifact_path"

bunx eas-cli submit \
  --platform ios \
  --profile production \
  --path "$artifact_path" \
  --auto-testflight-setup
