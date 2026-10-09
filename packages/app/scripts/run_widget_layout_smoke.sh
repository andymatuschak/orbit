#!/usr/bin/env bash

# End-to-end regression for Markdown-rich widget prompts. The dedicated
# Simulator must already have Orbit's medium widget at the top of Home Screen.
set -euo pipefail

simulator_udid="${ORBIT_SIMULATOR_UDID:?Set ORBIT_SIMULATOR_UDID to a dedicated, booted Simulator}"
app_path="${1:?Pass the built Orbit.app path}"
axe_binary="${ORBIT_AXE_BINARY:-$(command -v axe || true)}"
if [[ -z "$axe_binary" ]]; then
  echo "Install AXe before running the widget layout smoke test" >&2
  exit 69
fi

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
widget_source="$script_directory/../targets/widgets/Widget.swift"
widget_binary="$app_path/PlugIns/OrbitWidget.appex/OrbitWidget"
if [[ ! -x "$widget_binary" ]]; then
  echo "The app does not contain a built Orbit widget: $app_path" >&2
  exit 66
fi
if [[ "$widget_source" -nt "$widget_binary" ]]; then
  echo "The built widget is older than Widget.swift; rebuild before testing" >&2
  exit 65
fi

scratch_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-widget-layout-smoke.XXXXXX")"
trap 'rm -rf -- "$scratch_directory"' EXIT
ocr_binary="$scratch_directory/widget-layout-smoke-ocr"
xcrun swiftc \
  -framework AppKit \
  -framework Vision \
  "$script_directory/widget_ui_smoke_ocr.swift" \
  -o "$ocr_binary"

bash "$script_directory/seed_widget_layout_smoke.sh" "$simulator_udid" >/dev/null
xcrun simctl install "$simulator_udid" "$app_path"
xcrun simctl terminate "$simulator_udid" com.withorbit.native >/dev/null 2>&1 || true

screen_text() {
  local screenshot="$scratch_directory/screen.png"
  xcrun simctl io "$simulator_udid" screenshot "$screenshot" >/dev/null
  "$ocr_binary" "$screenshot"
}

tap_action() {
  "$axe_binary" touch -x 350 -y "$1" --down --up --udid "$simulator_udid"
}

# A widget can retain its last archived timeline across an app reinstall. The
# seed includes matching disposable gate rows for the interaction smoke tasks,
# so real App Intents can advance any prior smoke state into these fixtures.
constitution_text=""
for _ in {1..12}; do
  constitution_text="$(screen_text)"
  if grep -Fqi 'Constitution: 11th Amendment' <<<"$constitution_text" \
    && grep -Fqi 'citizens cannot sue' <<<"$constitution_text"; then
    break
  fi
  tap_action 170
  sleep 2
  tap_action 215
  sleep 2
done

if ! grep -Fqi 'Constitution: 11th Amendment' <<<"$constitution_text" \
  || ! grep -Fqi 'citizens cannot sue' <<<"$constitution_text"; then
  echo "The compacted Constitution prompt did not render its content" >&2
  echo "$constitution_text" >&2
  exit 1
fi

# Reveal if needed, then record the review so the ordinary timeline advances
# to the second exact regression record.
if ! grep -Fqi '1795' <<<"$constitution_text"; then
  tap_action 170
  sleep 2
fi
tap_action 215

about_text=""
for _ in {1..12}; do
  sleep 1
  about_text="$(screen_text)"
  if grep -Fqi 'About Face requirements' <<<"$about_text" \
    && grep -Fqi 'Explore and brainstorm' <<<"$about_text"; then
    break
  fi
done

if ! grep -Fqi 'About Face requirements' <<<"$about_text" \
  || ! grep -Fqi 'Explore and brainstorm' <<<"$about_text"; then
  echo "The compacted About Face list did not render its content" >&2
  echo "$about_text" >&2
  exit 1
fi

echo "Widget layout smoke test passed: both Markdown-rich prompts use the available height."
