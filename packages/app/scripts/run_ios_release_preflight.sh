#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd -- "$(dirname -- "$0")" && pwd)"
repository_directory="$(cd -- "$script_directory/../../.." && pwd)"

# Distribution is deliberately not the integration-test loop. Prove the
# local-first review acknowledgement boundary and native widget projection
# before spending time signing or uploading an iOS build.
cd -- "$repository_directory"
bun test \
  packages/app/src/sync/HostedReviewDatabase.test.ts \
  packages/app/src/sync/openHostedReviewDatabase.test.ts \
  packages/app/src/sync/NativeHostedSyncTransport.test.ts \
  packages/app/src/vault/WidgetProjectionCoordinator.test.ts \
  packages/app/src/vault/nativePerTaskDocuments.test.ts \
  packages/app/src/vault/widgetForeground.test.ts
packages/app/scripts/test_widget_projection_writer.sh
