#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"
app_directory="$repository_directory/packages/app"
configuration_path="${ORBIT_LAB_CONFIG:-$HOME/Library/Application Support/Orbit Lab/config.json}"
metro_port="${ORBIT_METRO_PORT:-8081}"
if [[ "$#" -gt 0 ]]; then
  if [[ "$#" -ne 2 || "$1" != "--config" ]]; then
    echo "Usage: bash scripts/lab_dev.sh [--config <private-config>]" >&2
    exit 64
  fi
  configuration_path="$2"
fi
if [[ ! -f "$configuration_path" ]]; then
  echo "Import and configure the private Lab vault before starting development." >&2
  exit 66
fi
configuration_path="$(cd -- "$(dirname -- "$configuration_path")" && pwd)/$(basename -- "$configuration_path")"

# Resolve the one configured private origin; __DEV__ does not choose a backend.
cd -- "$app_directory"
export EXPO_PUBLIC_ORBIT_LAB_ORIGIN="$(node "$repository_directory/node_modules/expo/bin/cli" config --type public --json | node -e 'let text=""; process.stdin.on("data", b => text += b); process.stdin.on("end", () => console.log(new URL(JSON.parse(text).updates.url).origin));')"
cd -- "$repository_directory"
bun run build
service_port="$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).port ?? 8787)' "$configuration_path")"
if curl --silent --max-time 1 "http://127.0.0.1:$service_port/_health" >/dev/null; then
  echo "Lab server port is already occupied; stop that process before starting development." >&2
  exit 69
fi
compiler_pid=""
backend_pid=""
cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  [[ -z "$compiler_pid" ]] || kill -TERM "$compiler_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || kill -TERM "$backend_pid" 2>/dev/null || true
  [[ -z "$compiler_pid" ]] || wait "$compiler_pid" 2>/dev/null || true
  # Node's watch supervisor waits for the writer's graceful shutdown before
  # restarting or exiting; don't layer another restart/kill supervisor over it.
  [[ -z "$backend_pid" ]] || wait "$backend_pid" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
node node_modules/@typescript/native/bin/tsc -b -w packages/tsconfig.json &
compiler_pid="$!"
node --watch --watch-preserve-output --watch-kill-signal SIGTERM \
  packages/automerge-sync-server/dist/index.js --config "$configuration_path" &
backend_pid="$!"
ready=false
for ((attempt = 0; attempt < 20; attempt++)); do
  if curl --fail --silent --max-time 1 "http://127.0.0.1:$service_port/_ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.2
done
if [[ "$ready" != true ]]; then
  echo "Lab server did not start; check its configuration and startup error above." >&2
  exit 1
fi
cd -- "$app_directory"
node "$repository_directory/node_modules/expo/bin/cli" start \
  --web --dev-client --host lan --port "$metro_port"
