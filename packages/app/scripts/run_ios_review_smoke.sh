#!/usr/bin/env bash

set -euo pipefail

simulator_udid="${ORBIT_SIMULATOR_UDID:-}"
bundle_id="com.withorbit.native"
metro_port="${ORBIT_METRO_PORT:-8081}"
axe_binary="${ORBIT_AXE_BINARY:-$(command -v axe || command -v AXe || true)}"

if [[ -z "$simulator_udid" ]]; then
  echo "Set ORBIT_SIMULATOR_UDID to a dedicated, booted iOS Simulator." >&2
  exit 64
fi

if [[ -z "$axe_binary" ]]; then
  echo "Install AXe (brew install cameroncooke/axe/axe) before running this test." >&2
  exit 69
fi

if ! curl --fail --silent --max-time 2 http://127.0.0.1:4400/emulators >/dev/null; then
  echo "Start the Firebase emulator suite with: bun --cwd packages/backend dev" >&2
  exit 69
fi

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
app_directory="$(cd -- "$script_directory/.." && pwd)"
repository_directory="$(cd -- "$app_directory/../.." && pwd)"
scratch_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-review-smoke.XXXXXX")"
metro_pid=""
control_pid=""

cleanup() {
  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$control_pid" ]]; then
    kill "$control_pid" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$scratch_directory"
}
trap cleanup EXIT

describe_ui() {
  "$axe_binary" describe-ui --udid "$simulator_udid"
}

wait_for_text() {
  local expected="$1"
  local attempts="${2:-120}"
  local tree
  for ((attempt = 0; attempt < attempts; attempt++)); do
    tree="$(describe_ui 2>/dev/null || true)"
    if grep -Fq -- "$expected" <<<"$tree"; then
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for Simulator UI text: $expected" >&2
  describe_ui 2>/dev/null | grep -E '"(AXLabel|title)" : ' | tail -n 35 >&2 || true
  return 1
}

tap_label() {
  "$axe_binary" tap \
    --label "$1" \
    --element-type Button \
    --tap-style physical \
    --wait-timeout 10 \
    --post-delay 0.25 \
    --udid "$simulator_udid"
}

dismiss_dev_menu() {
  local tree
  tree="$(describe_ui 2>/dev/null || true)"
  if grep -Fq -- '"AXLabel" : "Close"' <<<"$tree"; then
    tap_label "Close"
  fi
}

launch_app() {
  local metro_url="${1:-}"
  xcrun simctl launch \
    --terminate-running-process \
    "$simulator_udid" \
    "$bundle_id" >/dev/null
  if [[ "$metro_url" != "metro" ]]; then
    return
  fi
  # Address Metro directly; Bonjour discovery and the Dev Client chooser are
  # unrelated to review behavior and intermittently fail on the Simulator.
  xcrun simctl openurl "$simulator_udid" \
    "exp+orbit://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
}

review_once() {
  dismiss_dev_menu
  wait_for_text "Show Answer"
  tap_label "Show Answer"
  wait_for_text "Remembered"
  dismiss_dev_menu
  tap_label "Remembered"
}

xcrun simctl bootstatus "$simulator_udid" -b
if curl --fail --silent --max-time 1 "http://localhost:$metro_port/status" >/dev/null || \
   curl --fail --silent --max-time 1 http://127.0.0.1:8787/_smoke >/dev/null; then
  echo "Smoke-test ports are already occupied; stop the existing test servers first." >&2
  exit 1
fi
xcrun simctl uninstall "$simulator_udid" "$bundle_id" >/dev/null 2>&1 || true

(cd -- "$app_directory" && exec bun scripts/ios_review_smoke_control_server.ts \
  >"$scratch_directory/control.log" 2>&1) &
control_pid="$!"
for ((attempt = 0; attempt < 30; attempt++)); do
  if curl --fail --silent --max-time 1 http://127.0.0.1:8787/_smoke | grep -Fq ready; then
    break
  fi
  if ! kill -0 "$control_pid" >/dev/null 2>&1; then
    cat "$scratch_directory/control.log" >&2
    exit 1
  fi
  sleep 1
done
if ! curl --fail --silent --max-time 1 http://127.0.0.1:8787/_smoke | grep -Fq ready; then
  echo "Review smoke control stub did not become ready" >&2
  exit 1
fi

(
  cd -- "$app_directory"
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC=true \
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN=http://127.0.0.1:8787 \
    exec node "$repository_directory/node_modules/expo/bin/cli" start \
      --dev-client --host lan --port "$metro_port" \
      >"$scratch_directory/metro.log" 2>&1
) &
metro_pid="$!"

for ((attempt = 0; attempt < 60; attempt++)); do
  if curl --fail --silent --max-time 1 \
    "http://localhost:$metro_port/status" | grep -Fq "packager-status:running"; then
    break
  fi
  if ! kill -0 "$metro_pid" >/dev/null 2>&1; then
    echo "Metro exited before becoming ready" >&2
    cat "$scratch_directory/metro.log" >&2
    exit 1
  fi
  sleep 1
done

(
  cd -- "$app_directory"
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC=true \
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN=http://127.0.0.1:8787 \
    bunx expo run:ios \
      --device "$simulator_udid" \
      --no-bundler
)

# Stop before writing the fixture so AsyncStorage and Repo Swift cannot have
# those files open. The seeder authenticates against the local Firebase
# emulator and writes Firebase's ordinary persisted-user record, the vault
# registry, and Automerge documents to the app container.
xcrun simctl terminate "$simulator_udid" "$bundle_id"
app_container="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" data)"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_review_smoke.ts seed "$app_container"
)

launch_started_seconds="$SECONDS"
launch_app metro
wait_for_text "Orbit review smoke test: first durable write"
echo "First locally durable review appeared after $((SECONDS - launch_started_seconds))s."
dismiss_dev_menu
review_once
wait_for_text "Orbit review smoke test: second durable write"
review_once
wait_for_text "Orbit review smoke test: persisted after relaunch"

# A process restart proves the visible advancement came from durable Automerge
# state rather than React state. Then inspect the same ordinary-file store from
# outside the process and require exactly two review observations.
xcrun simctl terminate "$simulator_udid" "$bundle_id"
relaunch_started_seconds="$SECONDS"
launch_app
wait_for_text "Orbit review smoke test: persisted after relaunch"
echo "Cached review appeared after $((SECONDS - relaunch_started_seconds))s on relaunch."
xcrun simctl terminate "$simulator_udid" "$bundle_id"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_review_smoke.ts verify "$app_container" 2
)

echo "iOS review smoke test passed: two accessibility-driven reviews survived relaunch."
grep -F "[Performance]" "$scratch_directory/metro.log" | tail -n 20 || true
