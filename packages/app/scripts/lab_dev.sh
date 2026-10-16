#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"
app_directory="$repository_directory/packages/app"
configuration_path="${ORBIT_LAB_CONFIG:-$HOME/Library/Application Support/Orbit Lab/config.json}"
metro_port="${ORBIT_METRO_PORT:-8081}"
client_only=false
if [[ "${1:-}" == "--client-only" ]]; then client_only=true; shift; fi
if [[ "$#" -gt 0 ]]; then
  if [[ "$#" -ne 2 || "$1" != "--config" ]]; then
    echo "Usage: bash scripts/lab_dev.sh [--client-only] [--config <private-config>]" >&2
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
if [[ "$client_only" == true ]]; then
  curl --fail --silent --max-time 2 "http://127.0.0.1:$service_port/_ready" >/dev/null || {
    echo "Start the managed backend with bun run lab:service start first." >&2; exit 69;
  }
elif curl --silent --max-time 1 "http://127.0.0.1:$service_port/_health" >/dev/null; then
  echo "Lab backend is already running. Use lab:dev --client-only, or lab:service stop for backend watch mode." >&2
  exit 69
fi
compiler_pid=""
backend_pid=""
metro_pid=""
cleanup() {
  local status="$?"
  trap - EXIT INT TERM
  [[ -z "$metro_pid" ]] || kill -TERM "$metro_pid" 2>/dev/null || true
  [[ -z "$compiler_pid" ]] || kill -TERM "$compiler_pid" 2>/dev/null || true
  [[ -z "$backend_pid" ]] || kill -TERM "$backend_pid" 2>/dev/null || true
  [[ -z "$compiler_pid" ]] || wait "$compiler_pid" 2>/dev/null || true
  [[ -z "$metro_pid" ]] || wait "$metro_pid" 2>/dev/null || true
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
if [[ "$client_only" == false ]]; then
  node --watch --watch-preserve-output --watch-kill-signal SIGTERM \
    packages/automerge-sync-server/dist/index.js --config "$configuration_path" &
  backend_pid="$!"
fi
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
  --web --dev-client --host lan --port "$metro_port" &
metro_pid="$!"
# A builtin wait lets TERM/INT run cleanup immediately; a foreground external
# command makes Bash defer the trap until Metro eventually exits on its own.
wait "$metro_pid"
