#!/usr/bin/env bash

# End-to-end WidgetKit interaction test. The dedicated Simulator must already
# have Orbit's medium widget at the top of its Home Screen. Fixture data is
# written only to the ordinary disposable projection JSON handoff.
set -euo pipefail

simulator_udid="${ORBIT_SIMULATOR_UDID:?Set ORBIT_SIMULATOR_UDID to a dedicated, booted Simulator}"
app_path="${1:?Pass the built Orbit.app path}"
axe_binary="${ORBIT_AXE_BINARY:-$(command -v axe || true)}"
if [[ -z "$axe_binary" ]]; then
  echo "Install AXe before running the widget UI smoke test" >&2
  exit 69
fi

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
scratch_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-widget-ui-smoke.XXXXXX")"
trap 'rm -rf -- "$scratch_directory"' EXIT
ocr_binary="$scratch_directory/widget-ui-smoke-ocr"
xcrun swiftc \
  -framework AppKit \
  -framework Vision \
  "$script_directory/widget_ui_smoke_ocr.swift" \
  -o "$ocr_binary"

app_group_path="$(xcrun simctl get_app_container "$simulator_udid" com.withorbit.native groups | awk '$1 == "group.com.withorbit.native" { print $2 }')"
if [[ "$app_group_path" != *"/CoreSimulator/Devices/$simulator_udid/"* ]]; then
  echo "Refusing to write outside the requested Simulator app group" >&2
  exit 1
fi
preferences_path="$app_group_path/Library/Preferences/group.com.withorbit.native.plist"

# Clear the previous answer state before publishing a fresh projection. The
# installation asks WidgetKit to archive a new timeline without app UI hooks.
if [[ -f "$preferences_path" ]]; then
  /usr/libexec/PlistBuddy -c 'Delete :OrbitWidget.revealedReviewItem' "$preferences_path" >/dev/null 2>&1 || true
fi
bash "$script_directory/seed_widget_ui_smoke.sh" "$simulator_udid" >/dev/null
xcrun simctl install "$simulator_udid" "$app_path"
xcrun simctl terminate "$simulator_udid" com.withorbit.native >/dev/null 2>&1 || true

assert_screen_text() {
  local name="$1"
  local expected="$2"
  local screenshot="$scratch_directory/$name.png"
  local recognized=""
  local attempt
  for attempt in {1..20}; do
    xcrun simctl io "$simulator_udid" screenshot "$screenshot" >/dev/null
    recognized="$("$ocr_binary" "$screenshot")"
    if grep -Fqi -- "$expected" <<<"$recognized"; then
      return 0
    fi
    sleep 0.25
  done
  echo "Expected the widget screen to contain: $expected" >&2
  echo "$recognized" >&2
  return 1
}

tap_widget() {
  "$axe_binary" touch -x 350 -y "$1" --down --up --udid "$simulator_udid"
}

assert_screen_text front-one "first prompt"
tap_widget 170
assert_screen_text answer-one "first answer"
tap_widget 215
assert_screen_text front-two "second prompt"
tap_widget 170
assert_screen_text answer-two "second answer"
tap_widget 215
assert_screen_text front-three "third prompt"

result="$(sh "$script_directory/run_widget_projection_tool.sh" inspect "$app_group_path" widget-ui-smoke)"
if [[ "$result" != "2|widget-smoke-b-3" ]]; then
  echo "Unexpected widget projection/outbox state: $result" >&2
  exit 1
fi

echo "Widget UI smoke test passed: reveal stayed on each prompt and two reviews advanced to the third."
