#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"
app_directory="$repository_directory/packages/app"
target=""
udid=""
install=false
publish=false
build_number=""
configuration=""
output=""
usage() {
  echo "Usage: bash scripts/lab_install.sh (--simulator <UDID> | --device <UDID>) [--install] [--output <artifact-directory>] [--publish --build-number <integer> [--config <private-config>]]"
}
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --simulator|--device)
      [[ -z "$target" && "$#" -ge 2 ]] || { usage >&2; exit 64; }
      target="${1#--}"
      udid="$2"
      shift 2 ;;
    --install) install=true; shift ;;
    --publish) publish=true; shift ;;
    --build-number|--config)
      [[ "$#" -ge 2 ]] || { usage >&2; exit 64; }
      if [[ "$1" == "--build-number" ]]; then build_number="$2"; else configuration="$2"; fi
      shift 2 ;;
    --output)
      [[ "$#" -ge 2 ]] || { usage >&2; exit 64; }
      output="$2"
      shift 2 ;;
    --help) usage; exit 0 ;;
    *) usage >&2; exit 64 ;;
  esac
done
[[ -n "$target" && -n "$udid" ]] || { usage >&2; exit 64; }
if [[ "$publish" == true ]]; then
  [[ "$target" == "device" && "$build_number" =~ ^[1-9][0-9]{0,17}$ && "$install" == false ]] || {
    echo "Publication requires --device and --build-number, without --install. Install the published build through the app's update menu." >&2
    exit 64
  }
elif [[ -n "$configuration" ]]; then
  echo "--config is only used with --publish" >&2; exit 64
fi
if [[ -n "$build_number" ]]; then export ORBIT_LAB_BUILD_NUMBER="$build_number"; fi
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
# Prepare the pinned upstream packages and corrected Rust engine explicitly.
# Do not replace SwiftPM's downloaded/signed binary artifacts in DerivedData.
export ORBIT_AUTOMERGE_REPO_PACKAGE="$(node "$app_directory/expoPlugin/prepareAutomergeNative.js")"
swift_package="$(cd -- "$ORBIT_AUTOMERGE_REPO_PACKAGE/../automerge-swift" && pwd)"
sh "$script_directory/automerge-sync-regression/run.sh" \
  "$swift_package" "$swift_package/automergeFFI.xcframework"
# Regenerate configuration without deleting the existing project, then resolve
# native pods locally. No EAS, Firebase upload, or public release is involved.
node "$repository_directory/node_modules/expo/bin/cli" prebuild --platform ios --no-install
pod install --project-directory="$app_directory/ios"
# The prepared local Repo package includes the guarded receive-limit patch.
xcodebuild -resolvePackageDependencies -workspace "$app_directory/ios/Orbit.xcworkspace" \
  -scheme Orbit -derivedDataPath "$output/DerivedData"
build_arguments=(
  -workspace "$app_directory/ios/Orbit.xcworkspace" -scheme Orbit
  -configuration Release -derivedDataPath "$output/DerivedData"
  -destination "id=$udid"
)
if [[ "$target" == "simulator" ]]; then
  xcrun simctl bootstatus "$udid" -b
  # Simulator App Groups still require entitlements. An unsigned app can pass
  # review tests while silently lacking its widget handoff container.
  xcodebuild "${build_arguments[@]}" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES build
  built_app="$output/DerivedData/Build/Products/Release-iphonesimulator/Orbit.app"
else
  # Use the existing team, app identity and App Group. Register/profile changes
  # are left to Xcode's ordinary local signing flow, not cloud distribution.
  if [[ "$publish" == true ]]; then
    # Archive on the Mac even when the registered phone is away or locked.
    build_arguments=(
      -workspace "$app_directory/ios/Orbit.xcworkspace" -scheme Orbit
      -configuration Release -derivedDataPath "$output/DerivedData"
      -destination 'generic/platform=iOS'
    )
    archive="$output/Orbit-$build_number.xcarchive"
    exported="$output/export-$build_number"
    [[ ! -e "$archive" && ! -e "$exported" ]] || {
      echo "Build artifacts already exist; choose a new build number or output directory." >&2; exit 64
    }
    xcodebuild "${build_arguments[@]}" DEVELOPMENT_TEAM=MQ22N839N8 \
      -archivePath "$archive" archive
    # Xcode's exporter expects Apple's rsync, not Homebrew's incompatible flags.
    export PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
    xcodebuild -exportArchive -archivePath "$archive" -exportPath "$exported" \
      -exportOptionsPlist "$script_directory/lab_export_options.plist" -allowProvisioningUpdates
    publication_arguments=(--ipa "$exported/Orbit.ipa" --device "$udid")
    [[ -z "$configuration" ]] || publication_arguments+=(--config "$configuration")
    bun "$script_directory/lab_publish_native.ts" "${publication_arguments[@]}"
    exit 0
  else
    xcodebuild "${build_arguments[@]}" DEVELOPMENT_TEAM=MQ22N839N8 build
    built_app="$output/DerivedData/Build/Products/Release-iphoneos/Orbit.app"
  fi
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
