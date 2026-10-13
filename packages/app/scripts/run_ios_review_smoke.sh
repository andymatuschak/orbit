#!/usr/bin/env bash
set -euo pipefail

# Exercise an already-installed Release app and disposable real sync service.
# No Metro, production config, live vault, or application-only fixture branch.
# Dedicated loopback port 8788 leaves the private Lab on 8787 untouched.
if [[ "${1:-}" == "--help" ]]; then
  echo "Set ORBIT_SIMULATOR_UDID to a dedicated booted Simulator with Orbit Release installed."
  echo "Requires AXe, Node, built workspace/server, and unused localhost port 8788."
  echo "Seeds 53 due tasks; tests native ↔ JS and offline image/review durability."
  echo "Cold relaunch must sync reviewed task documents now outside the first 50."
  echo "Restores the previous Lab selection; retains fixture receipts/logs for inspection."
  exit 0
fi
simulator_udid="${ORBIT_SIMULATOR_UDID:?Set a dedicated booted Simulator UDID}"
bundle_id="com.withorbit.native"
axe_binary="${ORBIT_AXE_BINARY:-$(command -v axe || command -v AXe || true)}"
[[ -n "$axe_binary" ]] || { echo "Install AXe before running this gate." >&2; exit 69; }
script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
checkout="$(cd -- "$script_directory/../../.." && pwd)"
node_binary="${ORBIT_NODE_BINARY:-node}"
fixture() { "$node_binary" --experimental-transform-types "$script_directory/ios_review_fixture.mjs" "$@"; }
[[ "$simulator_udid" =~ ^[A-Fa-f0-9]{8}(-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$ ]] || { echo "Invalid Simulator UDID" >&2; exit 64; }
command -v lsof >/dev/null
assert_port_free() {
  if lsof -nP -iTCP:8788 -sTCP:LISTEN >/dev/null; then
    echo "Fixture port 8788 is occupied. The private Lab on 8787 must remain untouched." >&2
    return 69
  fi
}
assert_port_free
[[ -f "$checkout/packages/automerge-sync-server/dist/index.js" ]] || { echo "Build the workspace/server first." >&2; exit 69; }
app_container="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" data)"
app_binary="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" app)"
[[ "$app_container" == *"/CoreSimulator/Devices/$simulator_udid/data/Containers/Data/Application/"* ]] || { echo "Not the selected Simulator container" >&2; exit 64; }
[[ -f "$app_binary/main.jsbundle" ]] || { echo "Install a Release build with an embedded bundle; this gate never builds or installs." >&2; exit 69; }
server_pid=""; paired=false; receipt=""
stop_server() {
  if [[ -n "$server_pid" ]]; then
    kill -TERM "$server_pid" 2>/dev/null || true
    for ((attempt = 0; attempt < 30; attempt++)); do
      kill -0 "$server_pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$server_pid" 2>/dev/null; then
      echo "Fixture server failed to flush/shut down; keeping its receipt." >&2
      kill -KILL "$server_pid" 2>/dev/null || true
      wait "$server_pid" 2>/dev/null || true
      server_pid=""; return 1
    fi
    wait "$server_pid"; server_pid=""
  fi
}
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  stop_server || status=1
  if $paired; then
    xcrun simctl terminate "$simulator_udid" "$bundle_id" >/dev/null 2>&1 || true
    fixture restore-simulator "$receipt" "$app_container" || status=1
  fi
  [[ -z "$receipt" ]] || echo "Fixture receipt: $receipt"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
start_server() {
  assert_port_free
  "$node_binary" "$checkout/packages/automerge-sync-server/dist/index.js" --config "$configuration" >>"$fixture_directory/server.log" 2>&1 &
  server_pid=$!
  for ((attempt = 0; attempt < 30; attempt++)); do
    kill -0 "$server_pid" 2>/dev/null || { echo "Fixture server exited; inspect $fixture_directory/server.log" >&2; return 1; }
    if curl --fail --silent --max-time 2 http://127.0.0.1:8788/_ready >/dev/null; then return 0; fi
    sleep 1
  done
  echo "Fixture server was not ready in 30s" >&2; return 1
}

describe_ui() { "$axe_binary" describe-ui --udid "$simulator_udid"; }
wait_for_text() {
  local expected="$1"
  for ((attempt = 0; attempt < 30; attempt++)); do
    if describe_ui 2>/dev/null | rg -Fq -- "$expected"; then return 0; fi
    sleep 1
  done
  echo "Timed out waiting for: $expected" >&2
  describe_ui >&2 || true
  return 1
}
tap_label() {
  "$axe_binary" tap --label "$1" --element-type Button --tap-style physical \
    --wait-timeout 10 --post-delay 0.25 --udid "$simulator_udid"
}
review_once() {
  wait_for_text "Show Answer"
  tap_label "Show Answer"
  wait_for_text "Remembered"
  tap_label "Remembered"
}
launch_app() {
  xcrun simctl launch --terminate-running-process "$simulator_udid" "$bundle_id" >/dev/null
}

xcrun simctl terminate "$simulator_udid" "$bundle_id" >/dev/null 2>&1 || true
prepared="$(fixture prepare)"
receipt="$("$node_binary" -e 'console.log(JSON.parse(process.argv[1]).receiptPath)' "$prepared")"
configuration="$("$node_binary" -e 'console.log(JSON.parse(process.argv[1]).configurationPath)' "$prepared")"
fixture_directory="$(dirname -- "$receipt")"
fixture pair-simulator "$receipt" "$app_container"
paired=true
start_server
launch_app
wait_for_text "Orbit Lab native sync: phone review reaches JavaScript"
review_once
wait_for_text "Orbit Lab native sync: JavaScript review advances phone"
fixture verify-server "$receipt" 1
fixture js-review-second "$receipt"
wait_for_text "Orbit Lab native sync: offline review survives reconnect"

stop_server
xcrun simctl terminate "$simulator_udid" "$bundle_id"
launch_app
wait_for_text "Orbit Lab native sync: offline review survives reconnect"
wait_for_text "Show Answer"
# Image loading is asynchronous too: require visible pixels, not just a prompt.
image_visible=false
for ((attempt = 0; attempt < 10; attempt++)); do
  xcrun simctl io "$simulator_udid" screenshot "$fixture_directory/offline.png" >/dev/null
  if fixture verify-image "$receipt" "$fixture_directory/offline.png" 2>"$fixture_directory/image-check.log"; then image_visible=true; break; fi
  sleep 1
done
$image_visible || { cat "$fixture_directory/image-check.log" >&2; exit 1; }
review_once
wait_for_text "Orbit Lab native sync: filler task 04"
xcrun simctl terminate "$simulator_udid" "$bundle_id"
fixture verify-native "$receipt" "$app_container" 3
start_server
launch_app
wait_for_text "Orbit Lab native sync: filler task 04"
fixture verify-server "$receipt" 3
echo "Release review gate passed: native ↔ JS, offline PNG/review, cold relaunch and reviewed documents outside the 50-task window."
