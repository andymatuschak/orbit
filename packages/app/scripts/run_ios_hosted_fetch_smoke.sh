#!/usr/bin/env bash

set -euo pipefail

simulator_udid="${ORBIT_SIMULATOR_UDID:-}"
bundle_id="com.withorbit.native"
metro_port="${ORBIT_METRO_PORT:-8081}"
build_configuration="${ORBIT_IOS_CONFIGURATION:-Debug}"
axe_binary="${ORBIT_AXE_BINARY:-$(command -v axe || command -v AXe || true)}"

if [[ -z "$simulator_udid" ]]; then
  echo "Set ORBIT_SIMULATOR_UDID to a dedicated, booted iOS Simulator." >&2
  exit 64
fi
if [[ -z "$axe_binary" ]]; then
  echo "Install AXe before running this test." >&2
  exit 69
fi
if ! curl --fail --silent --max-time 2 http://127.0.0.1:4400/emulators >/dev/null; then
  echo "Start the Firebase emulator suite with: bun --cwd packages/backend dev" >&2
  exit 69
fi

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
app_directory="$(cd -- "$script_directory/.." && pwd)"
repository_directory="$(cd -- "$app_directory/../.." && pwd)"
scratch_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-hosted-fetch-smoke.XXXXXX")"
metro_pid=""
server_pid=""
log_pid=""
remote_pid=""

cleanup() {
  local status="$?"
  if [[ -n "$metro_pid" ]]; then
    kill "$metro_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$log_pid" ]]; then
    kill "$log_pid" >/dev/null 2>&1 || true
  fi
  if [[ -n "$remote_pid" ]]; then
    kill "$remote_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 && "${ORBIT_KEEP_SMOKE_ARTIFACTS:-}" == "true" ]]; then
    echo "Preserved failed smoke artifacts at $scratch_directory" >&2
  else
    rm -rf -- "$scratch_directory"
  fi
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
    if [[ -n "$server_pid" ]] && ! kill -0 "$server_pid" >/dev/null 2>&1; then
      echo "Hosted-fetch smoke server exited while waiting for: $expected" >&2
      cat "$scratch_directory/server.log" >&2
      return 1
    fi
    if [[ -n "$remote_pid" ]] && ! kill -0 "$remote_pid" >/dev/null 2>&1; then
      echo "Network review client exited while waiting for: $expected" >&2
      cat "$scratch_directory/remote.log" >&2
      return 1
    fi
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
  for ((attempt = 0; attempt < 12; attempt++)); do
    tree="$(describe_ui 2>/dev/null || true)"
    if grep -Fq -- '"AXLabel" : "Continue"' <<<"$tree"; then
      tap_label "Continue"
      continue
    fi
    if grep -Fq -- '"AXLabel" : "Close"' <<<"$tree"; then
      tap_label "Close"
      return 0
    fi
    sleep 0.5
  done
}

launch_app() {
  xcrun simctl launch \
    --terminate-running-process \
    "$simulator_udid" \
    "$bundle_id" >/dev/null
  if [[ "$build_configuration" == "Debug" ]]; then
    xcrun simctl openurl "$simulator_udid" \
      "exp+orbit://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${metro_port}"
  fi
}

start_smoke_server() {
  (
    cd -- "$app_directory"
    exec node --experimental-transform-types \
      scripts/ios_hosted_fetch_smoke_server.ts "$fixture_path" \
      >"$scratch_directory/server.log" 2>&1
  ) &
  server_pid="$!"
  for ((attempt = 0; attempt < 30; attempt++)); do
    if curl --fail --silent --max-time 1 http://127.0.0.1:8787/_ready | grep -Fq true; then
      return 0
    fi
    if ! kill -0 "$server_pid" >/dev/null 2>&1; then
      cat "$scratch_directory/server.log" >&2
      exit 1
    fi
    sleep 1
  done
  echo "Hosted-fetch smoke server did not become ready" >&2
  exit 1
}

xcrun simctl bootstatus "$simulator_udid" -b
if { [[ "$build_configuration" == "Debug" ]] && \
     curl --fail --silent --max-time 1 "http://localhost:$metro_port/status" >/dev/null; } || \
   curl --fail --silent --max-time 1 http://127.0.0.1:8787/_health >/dev/null; then
  echo "Smoke-test ports are already occupied; stop the existing test servers first." >&2
  exit 1
fi
xcrun simctl uninstall "$simulator_udid" "$bundle_id" >/dev/null 2>&1 || true

if [[ "$build_configuration" == "Debug" ]]; then
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
      cat "$scratch_directory/metro.log" >&2
      exit 1
    fi
    sleep 1
  done
fi

(
  cd -- "$app_directory"
  # Release tests build without Expo's dev-client launcher: that launcher tries
  # to open a Metro URL even when --no-bundler is set. simctl installs/launches
  # the built binary below, so the test exercises the bundled production UI.
  if [[ "$build_configuration" == "Release" ]]; then
    build_device="generic"
    output_arguments=(--output "$scratch_directory/build")
  else
    build_device="$simulator_udid"
    output_arguments=()
  fi
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC=true \
  EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN=http://127.0.0.1:8787 \
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_ORIGIN=http://127.0.0.1:9099 \
    bunx expo run:ios \
      --device "$build_device" \
      --configuration "$build_configuration" \
      --no-bundler "${output_arguments[@]}"
)

if [[ "$build_configuration" == "Release" ]]; then
  xcrun simctl install "$simulator_udid" "$scratch_directory/build/Orbit.app"
  xcrun simctl spawn "$simulator_udid" log stream \
    --style compact \
    --level debug \
    --predicate 'process == "Orbit"' \
    >"$scratch_directory/simulator.log" 2>&1 &
  log_pid="$!"
fi
xcrun simctl terminate "$simulator_udid" "$bundle_id" >/dev/null 2>&1 || true
app_container="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" data)"
fixture_path="$scratch_directory/fixture.json"
server_storage="$scratch_directory/server-storage"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts prepare \
    "$app_container" \
    "$server_storage" \
    "$fixture_path"
)

start_smoke_server

launch_started_seconds="$SECONDS"
launch_app
if [[ "$build_configuration" == "Debug" ]]; then
  dismiss_dev_menu
fi
wait_for_text "Orbit hosted fetch smoke: first network task"
echo "Cold hosted review appeared after $((SECONDS - launch_started_seconds))s."
tap_label "Show Answer"
wait_for_text "Remembered"
tap_label "Remembered"
wait_for_text "Orbit hosted fetch smoke: second network task"

(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts wait-for-documents \
    "$app_container" \
    53
)

xcrun simctl terminate "$simulator_udid" "$bundle_id"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts verify \
    "$app_container" \
    "Orbit hosted fetch smoke: second network task"
)

warm_launch_started_seconds="$SECONDS"
launch_app
if [[ "$build_configuration" == "Debug" ]]; then
  dismiss_dev_menu
fi
wait_for_text "Orbit hosted fetch smoke: second network task" 30
echo "Warm local review appeared after $((SECONDS - warm_launch_started_seconds))s."

# Keep the second real Repo client connected until the native UI receives its
# task and catalog merges. Repo.apply acknowledges a local mutation, not
# remote delivery, so disconnecting it first would make this assertion race.
remote_release="$scratch_directory/release-network-client"
(
  cd -- "$app_directory"
  exec bun scripts/seed_ios_hosted_fetch_smoke.ts review-network \
    "$fixture_path" \
    "Orbit hosted fetch smoke: second network task" \
    "$remote_release" \
    >"$scratch_directory/remote.log" 2>&1
) &
remote_pid="$!"
wait_for_text "Hosted fetch scale task 00002" 30
touch "$remote_release"
wait "$remote_pid"
remote_pid=""
cat "$scratch_directory/remote.log"

# A warm catalog can need repair before the background connection is ready.
# Seed the store while the app is stopped, then exercise ordinary opening:
# no test-only UI branch, reinstall, or retry may rescue the missing task.
xcrun simctl terminate "$simulator_udid" "$bundle_id"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts seed-conflict "$app_container" "$fixture_path"
)
launch_app
if [[ "$build_configuration" == "Debug" ]]; then
  dismiss_dev_menu
fi
wait_for_text "Hosted fetch scale task 00002" 30
(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts wait-for-repair "$app_container" "$fixture_path"
)
if [[ "$build_configuration" == "Release" ]] && \
   grep -Eq 'Finishing remote fetch without any active network requests|MARKED UNAVAILABLE' "$scratch_directory/simulator.log"; then
  echo "Repo attempted a peerless fetch or reused an unavailable handle." >&2
  exit 1
fi

# Use the app's real published queue, not a widget fixture. Accept a review
# while the app is stopped, then prove the ordinary cached/offline opening
# durably imports it before acknowledging the pending JSON record.
app_group_directory="$(xcrun simctl get_app_container "$simulator_udid" "$bundle_id" groups |
  awk '$1 == "group.com.withorbit.native" { print $2 }')"
if [[ "$app_group_directory" != */CoreSimulator/Devices/"$simulator_udid"/data/Containers/Shared/AppGroup/* ]]; then
  echo "Refusing a widget handoff outside the dedicated Simulator." >&2
  exit 1
fi
widget_state="$app_group_directory/orbit-widget-v3.json"
for ((attempt = 0; attempt < 30; attempt++)); do
  if jq --exit-status '
    .selectedVaultID == "simulator-hosted-fetch-smoke" and
    (.pendingReviews | length) == 0 and
    .queue[0].task.spec.content.body.text == "Hosted fetch scale task 00002"
  ' "$widget_state" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
jq --exit-status '
  .selectedVaultID == "simulator-hosted-fetch-smoke" and
  (.pendingReviews | length) == 0 and
  .queue[0].task.spec.content.body.text == "Hosted fetch scale task 00002"
' "$widget_state" >/dev/null
xcrun simctl terminate "$simulator_udid" "$bundle_id"
widget_review_id="$("$script_directory/run_widget_projection_tool.sh" record-first \
  "$app_group_directory" simulator-hosted-fetch-smoke)"
jq --exit-status --arg review_id "$widget_review_id" '
  (.pendingReviews | length) == 1 and
  .pendingReviews[0].observationID == $review_id
' "$widget_state" >/dev/null
widget_review_task_id="$(jq --raw-output '.pendingReviews[0].taskID' "$widget_state")"
kill "$server_pid"
wait "$server_pid" || true
server_pid=""
launch_app
if [[ "$build_configuration" == "Debug" ]]; then
  dismiss_dev_menu
fi
wait_for_text "Hosted fetch scale task 00003" 30
for ((attempt = 0; attempt < 30; attempt++)); do
  if jq --exit-status '(.pendingReviews | length) == 0' "$widget_state" >/dev/null; then
    break
  fi
  sleep 1
done
jq --exit-status '
  (.pendingReviews | length) == 0 and
  .queue[0].task.spec.content.body.text == "Hosted fetch scale task 00003"
' "$widget_state" >/dev/null
xcrun simctl terminate "$simulator_udid" "$bundle_id"
(
  cd -- "$app_directory"
  bun scripts/seed_ios_hosted_fetch_smoke.ts verify \
    "$app_container" "Hosted fetch scale task 00003" 55 \
    "$widget_review_task_id" "$widget_review_id"
)
echo "Verified widget review $widget_review_id imported and acknowledged offline."

echo "iOS hosted-fetch smoke passed: cold working-set fetch, warm convergence, pre-connection catalog repair, and durable widget import."
if [[ "$build_configuration" == "Release" ]]; then
  grep -F "[Performance]" "$scratch_directory/simulator.log" | tail -n 20 || true
else
  grep -F "[Performance]" "$scratch_directory/metro.log" | tail -n 20 || true
fi
