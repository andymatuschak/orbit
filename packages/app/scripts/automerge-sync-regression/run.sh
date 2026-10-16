#!/bin/sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: sh run.sh <automerge-swift-source> <macOS-containing-automergeFFI.xcframework> [merge|sync|import]" >&2
  exit 64
fi
source_directory="$(CDPATH= cd -- "$1" && pwd)"
framework="$(CDPATH= cd -- "$2" && pwd)"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
test_directory="$(mktemp -d "${TMPDIR:-/tmp}/orbit-native-sync-regression.XXXXXX")"
trap 'rm -rf -- "$test_directory"' EXIT

cp "$script_directory/Package.swift" "$test_directory/Package.swift"
ln -s "$source_directory/Sources/Automerge" "$test_directory/Automerge"
ln -s "$source_directory/AutomergeUniffi" "$test_directory/AutomergeUniffi"
ln -s "$framework" "$test_directory/automergeFFI.xcframework"
ln -s "$script_directory/Sources" "$test_directory/Sources"
swift build --package-path "$test_directory" -c release --disable-sandbox
if [ "$#" -eq 3 ]; then
  "$test_directory/.build/release/SyncRegression" "$3"
else
  "$test_directory/.build/release/SyncRegression"
fi
