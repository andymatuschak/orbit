#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"
app_directory="$repository_directory/packages/app"
target=""
udid=""
install=false
output=""
usage() {
  echo "Usage: bash scripts/lab_install.sh (--simulator <UDID> | --device <UDID>) [--install] [--output <artifact-directory>]"
}
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --simulator|--device)
      [[ -z "$target" && "$#" -ge 2 ]] || { usage >&2; exit 64; }
      target="${1#--}"
      udid="$2"
      shift 2 ;;
    --install) install=true; shift ;;
    --output)
      [[ "$#" -ge 2 ]] || { usage >&2; exit 64; }
      output="$2"
      shift 2 ;;
    --help) usage; exit 0 ;;
    *) usage >&2; exit 64 ;;
  esac
done
[[ -n "$target" && -n "$udid" ]] || { usage >&2; exit 64; }
if [[ -z "$output" ]]; then
  # Reuse Xcode's object/module cache across native iterations. JavaScript
  # checkpoints never need this build; choose --output to retain an archive.
  output="${ORBIT_LAB_NATIVE_BUILD_DIRECTORY:-$HOME/Library/Caches/Orbit Lab/native}"
fi
mkdir -p -- "$output"
output="$(cd -- "$output" && pwd)"

cd -- "$repository_directory"
bun run build
bash "$script_directory/run_ios_release_preflight.sh"
cd -- "$app_directory"
export EXPO_PUBLIC_ORBIT_LAB_ORIGIN="$(node "$repository_directory/node_modules/expo/bin/cli" config --type public --json | node -e 'let text=""; process.stdin.on("data", b => text += b); process.stdin.on("end", () => console.log(new URL(JSON.parse(text).updates.url).origin));')"
# Regenerate configuration without deleting the existing project, then resolve
# native pods locally. No EAS, Firebase upload, or public release is involved.
node "$repository_directory/node_modules/expo/bin/cli" prebuild --platform ios --no-install
pod install --project-directory="$app_directory/ios"
build_arguments=(
  -workspace "$app_directory/ios/Orbit.xcworkspace" -scheme Orbit
  -configuration Release -derivedDataPath "$output/DerivedData"
  -destination "id=$udid"
)
if [[ "$target" == "simulator" ]]; then
  xcrun simctl bootstatus "$udid" -b
  xcodebuild "${build_arguments[@]}" CODE_SIGNING_ALLOWED=NO build
  built_app="$output/DerivedData/Build/Products/Release-iphonesimulator/Orbit.app"
else
  # Use the existing team, app identity and App Group. Register/profile changes
  # are left to Xcode's ordinary local signing flow, not cloud distribution.
  xcodebuild "${build_arguments[@]}" DEVELOPMENT_TEAM=MQ22N839N8 build
  built_app="$output/DerivedData/Build/Products/Release-iphoneos/Orbit.app"
fi
[[ -d "$built_app" ]] || { echo "Native build did not produce Orbit.app" >&2; exit 1; }
printf 'Optimized local app: %s\n' "$built_app"
if [[ "$install" == true ]]; then
  if [[ "$target" == "simulator" ]]; then
    xcrun simctl install "$udid" "$built_app"
  else
    # Installation preserves the app container. Never uninstall to work around
    # signing, reachability, or pairing problems; pending reviews are valuable.
    xcrun devicectl device install app --device "$udid" "$built_app"
  fi
fi
