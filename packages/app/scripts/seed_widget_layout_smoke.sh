#!/usr/bin/env bash

# Seed only a dedicated Simulator's ordinary JSON widget handoff. No UI
# fixture branches or mocked App Intents participate in the rendering gates.
set -euo pipefail

simulator_udid="${1:?Pass a dedicated Simulator UDID}"
app_group_path="$(xcrun simctl get_app_container "$simulator_udid" com.withorbit.native groups | awk '$1 == "group.com.withorbit.native" { print $2 }')"
if [[ "$app_group_path" != *"/CoreSimulator/Devices/$simulator_udid/"* ]]; then
  echo "Refusing to write outside the requested Simulator app group" >&2
  exit 1
fi
script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
sh "$script_directory/run_widget_projection_tool.sh" seed "$app_group_path" "widget-layout-smoke" "$script_directory/widget-projection-fixtures/layout.json"
echo "Seeded ordinary widget layout projection in $simulator_udid"
