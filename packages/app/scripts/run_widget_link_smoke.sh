#!/usr/bin/env bash

# End-to-end regression for Markdown links in a real WidgetKit timeline. The
# dedicated Simulator must already have Orbit's medium widget on Home Screen.
set -euo pipefail

simulator_udid="${ORBIT_SIMULATOR_UDID:?Set ORBIT_SIMULATOR_UDID to a dedicated, booted Simulator}"
app_path="${1:?Pass the built Orbit.app path}"
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

app_group_path="$(xcrun simctl get_app_container "$simulator_udid" com.withorbit.native groups | awk '$1 == "group.com.withorbit.native" { print $2 }')"
if [[ "$app_group_path" != *"/CoreSimulator/Devices/$simulator_udid/"* ]]; then
  echo "Refusing to write outside the requested Simulator app group" >&2
  exit 1
fi

scratch_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-widget-link-smoke.XXXXXX")"
trap 'rm -rf -- "$scratch_directory"' EXIT
ocr_binary="$scratch_directory/widget-link-smoke-ocr"
xcrun swiftc \
  -framework AppKit \
  -framework Vision \
  "$script_directory/widget_ui_smoke_ocr.swift" \
  -o "$ocr_binary"

sh "$script_directory/run_widget_projection_tool.sh" seed "$app_group_path" widget-layout-smoke "$script_directory/widget-projection-fixtures/link.json"
xcrun simctl install "$simulator_udid" "$app_path"

recognized=""
screenshot="$scratch_directory/link.png"
for _ in {1..20}; do
  sleep 0.5
  xcrun simctl io "$simulator_udid" screenshot "$screenshot" >/dev/null
  recognized="$("$ocr_binary" "$screenshot")"
  if grep -Fqi 'cognitive' <<<"$recognized" \
    && grep -Fqi 'outsourcing' <<<"$recognized"; then
    break
  fi
done

if ! grep -Fqi 'cognitive' <<<"$recognized" \
  || ! grep -Fqi 'outsourcing' <<<"$recognized" \
  || grep -Fqi 'hyp.is' <<<"$recognized" \
  || grep -Fqi 'distill.pub' <<<"$recognized"; then
  echo "The Markdown link did not render as linked label text" >&2
  echo "$recognized" >&2
  exit 1
fi

if [[ -n "${ORBIT_WIDGET_LINK_SCREENSHOT:-}" ]]; then
  cp "$screenshot" "$ORBIT_WIDGET_LINK_SCREENSHOT"
fi

echo "Widget link smoke test passed: the label is rendered and the Markdown URL is hidden."
