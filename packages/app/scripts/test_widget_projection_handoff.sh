#!/bin/sh
set -eu

script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
app_directory="$(dirname -- "$script_directory")"
output_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-widget-handoff-test.XXXXXX")"
trap 'rm -rf "$output_directory"' EXIT

xcrun swiftc \
  -swift-version 6 \
  -module-cache-path "$output_directory/module-cache" \
  "$app_directory/modules/orbit-automerge/ios/WidgetProjectionStore.swift" \
  "$script_directory/widget-projection-handoff-test/main.swift" \
  -o "$output_directory/widget-projection-handoff-test"

"$output_directory/widget-projection-handoff-test"
