#!/bin/sh
set -eu

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
app_directory="$(dirname -- "$script_directory")"
output_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-widget-reader-test.XXXXXX")"
trap 'rm -rf "$output_directory"' EXIT

xcrun swiftc \
  -swift-version 6 \
  -module-cache-path "$output_directory/module-cache" \
  "$app_directory/targets/widgets/Colors.swift" \
  "$app_directory/targets/widgets/OrbitTask.swift" \
  "$app_directory/modules/orbit-automerge/ios/WidgetProjectionStore.swift" \
  "$app_directory/targets/widgets/WidgetReviewItemDecoding.swift" \
  "$script_directory/widget-projection-reader-test/main.swift" \
  -o "$output_directory/widget-projection-reader-test"

"$output_directory/widget-projection-reader-test"
