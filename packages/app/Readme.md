# Orbit Lab client

This package contains the personal iOS and browser review clients. Both use one
shared task repository and review/session implementation. Web uses Repo JS with
the official IndexedDB storage adapter; iOS uses Repo Swift with ordinary files.
There is no Firebase login, public API fallback, embed, reminder settings page,
or legacy store selection.

Native builds target iOS, not Mac Catalyst. Space/1/2 review shortcuts remain
available in the browser; there is no native hardware-keyboard module.

The first launch pairs with a private origin and key. The installation keeps one
selection under `com.withorbit.lab.connection.v1`, with a fresh `lab-…` local
store ID. It never reads public Orbit's former vault registry. Subsequent launch
opens locally cached prompts without requiring the laptop. An uncached first
launch still needs the server; a known catalog without any readable prompt is
unavailable, not an empty review queue.

## Development and native code

The local sync/update backend runs as a macOS login service, independently of
Metro or a terminal. `bun run lab:service install` builds it and installs/starts
the user-owned LaunchAgent. macOS starts it at login and restarts an exited or
crashed process (with a ten-second throttle); this does not keep a sleeping or
logged-out Mac available. Tailscale must still be connected on both devices.

`bun run lab:service status` reports the PID, readiness, last exit/signal and log
location (`~/Library/Logs/Orbit Lab/server.log`). `restart` gracefully flushes
and restarts the compiled backend; run `bun run build` first after backend edits.
`stop` leaves it stopped until `start` or the next login. Use `uninstall` to
remove only the login service, retaining all vault and update files. Reinstall
after moving this checkout or removing its selected Node installation; the
plist records absolute paths, not a shell's version-manager setup. An optional
`install --config <private config>` selects a different configuration explicitly.

With that backend running, use `bun run lab:dev --client-only` from the repository
root for Metro and compiler watch. Closing that terminal does not stop sync or
phone updates. For backend auto-reload, stop the managed service, run ordinary
`bun run lab:dev`, then start the service again after leaving development mode.
Both paths use the same data and exclusive writer lock; they must not overlap.

The kernel holds `.writer-lock` through an open descriptor and releases it even
after SIGKILL. Its file intentionally remains: never delete it to unlock the
vault, since replacing its inode could permit overlapping writers. The same
lock protects offline import/calibration/snapshot operators; snapshots exclude
the lock file itself. No heartbeat, lease or PID-file recovery is involved.

Metro serves the web client and the connected development loop.
Set `EXPO_PUBLIC_ORBIT_LAB_ORIGIN` to the private
Tailscale HTTPS origin, or loopback HTTP for Simulator-only work; the pairing
key must never be an `EXPO_PUBLIC_` variable.

`bun run lab:install --simulator <UDID> --install` or
`bun run lab:install --device <UDID> --install` makes an optimized local binary.
The bundle identifier and App Group remain `com.withorbit.native` and
`group.com.withorbit.native`; Lab replaces Orbit instead of installing alongside
it. Preserve pending reviews before first replacement. Installation does not
delete the app container.

Simulator builds are ad-hoc signed with their normal entitlements. An unsigned
Simulator app can review successfully while lacking the shared widget App Group,
so the Home Screen gate must use the signed local build too.

Expo generates the native project. Keep changes in `modules`, `targets`, and
`expoPlugin`, not generated `ios` output. Expo 58's template now owns scene
startup and the scene manifest; the former Orbit adapter is removed. Repo Swift's
admission-order and remote-change notification workarounds remain covered by
regressions.

Use `lab:install` for native builds. It prepares local, pinned upstream Swift
packages rather than modifying SwiftPM's downloaded artifacts. Swift 0.7.2's
released XCFramework contains a Rust bug: a same-value write followed by a merge
can panic with `PatchLogMismatch`, then crash on the poisoned lock. The prepared
package keeps its Swift API/bindings and applies only the merged
[upstream core update](https://github.com/automerge/automerge-swift/pull/243),
building Rust Automerge 0.12.0. This reproduces and fixes Chonk's launch crash;
see the [validation record](../../design/automerge-validation-record.md).

The first native build needs Rust and downloads its iOS/arm64 Simulator targets
and Cargo dependencies. Later builds reuse the verified private cache; ordinary
JavaScript checkpoints do not build Rust. Remove `prepareAutomergeNative.js`
and the local-package override when an official Swift XCFramework includes this
fix. Package drift fails preparation rather than reverting to the old engine.
Every `lab:install` runs the synthetic native no-op/merge/sync regression against
that exact built library before compiling the app. The test uses fixed actors
and checks matching document heads and values, without reading the Lab vault.

Preparation also applies guarded Repo Swift 0.3.2 patches,
raising URLSession's default 1 MiB message limit to the server's finite 16 MiB
budget. A real catalog exceeded the default, silently breaking server → phone
sync while small reviews still uploaded. It also resets each peer's connection-
specific sync state before synchronizing on a new connection: otherwise a lost
outgoing message can remain marked in flight after reconnecting. Remove the
corresponding parts of `patchRepoSwift.js` when upstream exposes the receive
setting and resets sync state on reconnect. The large-catalog and interrupted-
sync Simulator gates must still pass after removal. Manual Expo/Xcode builds do
not run these preparations; the old `ios`/`ios:release` shortcuts are removed for
that reason.

## Offline application code

The installed app includes a complete bundle/assets. `expo-updates` selects the
embedded or downloaded checkpoint immediately, then checks the private endpoint
in the background. Launch and real background → foreground transitions check
both native releases and JavaScript checkpoints. Available updates are offered
immediately, even with a question or revealed answer on screen. An in-flight
review/delete/undo write still defers the prompt until it finishes. JavaScript
downloads can finish while reviewing, but applying code always requires approval
or a subsequent cold launch. **Later** suppresses that offer for the rest of the
mounted session.
Offline/up-to-date automatic checks stay quiet.

The menu's **Check for app update** uses the same paths but explicitly requests
an immediate result, including reoffering an update dismissed earlier. Reload
and install both recheck pending review/delete/undo writes. Diagnostic logs
identify the running update without test-only UI.

Publish with the root `lab:checkpoint` command and the binary's matching native
runtime version. Bump that version and rebuild when Swift, native dependencies,
or entitlements change. Metro's latest bundle is not an offline checkpoint.
The complete native download/kill/relaunch/rollback gates are recorded separately
in [the validation record](../../design/automerge-validation-record.md).

Native discovery checks `/updates/native.json` for a newer installed-app build
number, independently of Expo's runtime-filtered manifest:
an old runtime must still discover its native replacement. **Install** rechecks
the pending-write guard, then opens the `itms-services` manifest URL. iOS performs
the signed installation after user confirmation. Loopback Simulator builds skip
native discovery and retain ordinary JavaScript updates.

Publish with `bun run lab:install --device <registered-UDID> --publish
--build-number <new-integer>`, optionally `--output <artifact-directory>` and
`--config <private-config>`. The phone need not be connected for archival. The
export must contain unexpired ad-hoc app/extension profiles including that UDID;
development and App Store IPAs are not accepted. No EAS/Firebase distribution is
involved. HTTPS manifest and IPA URLs remain on the private Tailscale origin;
the iOS installer does not inherit the app's pairing headers. Build artifacts
are copied before atomically selecting the release, with old build URLs retained
for downloads already in progress. Never uninstall to work around signing.

## FSRS experiment

The root's scheduler policy selects the shared TypeScript scheduler. FSRS-6 uses
pinned `ts-fsrs@5.4.2`; Remembered maps to Good (3), Forgotten to Again (1).
Existing due dates/intervals continue using the original Orbit policy until a
component's first post-cutover review. Historical reviews reconstruct its FSRS
memory, with exact imported legacy aliases counted once for memory only. No
observations are deleted or rewritten. FSRS interval fuzz is disabled so peers
replay the same result. Forgotten retains the ten-minute retry; Skip defers one
day without claiming recall. Manual rescheduling changes only the due date.

The app advances from the saved authoritative task projection, not a second
optimistic scheduler; starburst previews use that same selected policy. The
widget still stores just the review outcome/time and the app applies the policy
when importing it. There is no Swift scheduler or SQL index. Task history remains
authoritative; the catalog carries a rebuildable scheduling summary for selecting
the small working set without opening every task.

FSRS review selection alternates highest-retrievability and oldest-due choices,
deduplicating tasks and preserving the earliest-due cloze component. Actually due
FSRS-era ten-minute retries precede that mixture and never use the normal
sixteen-hour lookahead. Cards without recall estimates enter the oldest-due lane.
The total number of saved reviews since cutover rotates the starting lane after
each review, including after relaunch or reviews from another device; rebuilding
the queue cannot repeatedly reset it to the easy lane. This count, stability and
last-review time are derived catalog fields, not another authoritative cursor or
store. Retrievability itself is computed at selection time rather than persisted.
Both catalog selection before the cap and final task projection use the same
selector. WidgetKit retains the supplied order, and order-only changes invalidate
its projection revision. Native runtime `orbit-lab-native-2` includes that widget
behavior; older runtimes retain their existing compatible checkpoints.

The optional local-only optimizer is pinned independently and is not shipped in
the client. It deduplicates exact legacy aliases, treats cloze components as
separate histories, keeps same-day context, excludes skips/reschedules, and
holds out the latest 20% of positive-day targets before the final all-data fit.
UTC calendar days match the runtime. Binary history does not separately identify
Hard/Easy behavior.

```sh
uv run --python 3.12 packages/automerge-sync-server/scripts/calibrateFSRS.py \
  --input '<private portable vault export>' --output '<new private directory>'
```

Upgrade/reload all Lab readers before changing the policy. After stopping the
Lab writer, the one-time operator takes a complete private snapshot and changes
only the root policy; it refuses an active writer, invalid parameters or an
already-FSRS root. It does not rebuild catalog documents or reschedule history.

```sh
bun packages/automerge-sync-server/scripts/activateFSRS.ts \
  --weights '<private weights.json>' --snapshot '<new private snapshot>'
```

See the validation record for the calibration metrics and activation status.

## Widget handoff

The app and WidgetKit extension compile the same Foundation helper.
`orbit-widget-v3.json` contains a disposable queue and durable pending reviews;
`OrbitAppGroup` selects its shared directory. Coordinated atomic replacement
prevents competing app/widget writers losing data. No Repo/network work occurs
inside the file-coordination lock.

Widget reviews retain stable IDs until the app durably imports them, acknowledges
only that batch, and installs a fresh queue. Opening or foregrounding the app
drains the outbox. The widget never opens the app's live Repo, and the app never
uses the disposable widget queue as its own review index.

After a local app mutation, the saved review and fresh widget file are complete
before the card advances. Queue notifications obey the same handoff boundary;
they cannot advance it ahead of a slower file write. This waits for local files,
not the laptop. A failed disposable projection is reported without rejecting or
replaying an already-saved review.

```sh
cd packages/app
bun test src expoPlugin
bun run test:widget-projection-writer
bun run test:widget-projection-reader
bun run test:widget-projection-handoff
```

The Swift tests compile the real helper under Swift 6 and cover independent
processes, interrupted writes, replay, selective acknowledgement, and malformed
journal preservation. Restricted execution sandboxes may need a narrow exception
for Foundation's temporary files and file-coordination service.

For actual controls, build the workspace and install a Release binary in a
dedicated booted Simulator. The review gate requires Node, AXe, and an unused
localhost port 8788; the private Lab on 8787 remains untouched. It never builds,
installs, or stops an existing server.

```sh
ORBIT_SIMULATOR_UDID=<UDID> bun run ios:review-smoke
scripts/run_ios_review_smoke.sh --help
ORBIT_SIMULATOR_UDID=<UDID> scripts/run_widget_ui_smoke.sh <Orbit.app-path>
ORBIT_SIMULATOR_UDID=<UDID> scripts/run_widget_layout_smoke.sh <Orbit.app-path>
ORBIT_SIMULATOR_UDID=<UDID> scripts/run_widget_link_smoke.sh <Orbit.app-path>
```

The review runner uses [ios_review_fixture.mjs](scripts/ios_review_fixture.mjs)
to create 53 due tasks (three named prompts and 50 fillers), plus future tasks
for a 14,000-row catalog, in a disposable Repo. It asserts that the actual
Automerge catalog sync response exceeds 1 MiB, then temporarily selects the vault
through the app's existing AsyncStorage record. Use
`ORBIT_SMOKE_CATALOG_TASK_COUNT=53` only for a separate small-fixture run; that
does not cover the native receive-limit regression.
It verifies native review → fresh JS peer, JS review → visible native queue
advancement, an offline cold launch with the PNG visibly rendered, durable
offline review bytes, and cold reconnect after the reviewed tasks fall outside
the first 50 catalog entries. The native proof directly decodes cached files;
it never opens Repo handles or starts catalog repair. It restores the previous
Lab selection, preserves other records,
flushes its own server, and retains receipts/logs. Physical-device containers
are rejected. No production configuration or test-only UI branch is involved.

The widget gates likewise use AXe/simctl and ordinary store writes. A runnable
gate is not a claim that a newly built binary passed; actual results belong in
[the validation record](../../design/automerge-validation-record.md).

For the complete app/widget handoff gate, install a Release Simulator build
with `EXPO_PUBLIC_ORBIT_LAB_ORIGIN=http://127.0.0.1:8788` and place its medium
widget at the top of the Home Screen, then run:

```sh
ORBIT_SIMULATOR_UDID=<UDID> bun run ios:widget-handoff-smoke
```

This focused 53-task FSRS fixture uses ports 8788/8789. A test-only TCP relay
drops the connection while keeping the same server Repo alive, so reconnecting
must reset in-flight bookkeeping rather than benefit from a new peer ID. The
gate exercises repeated Reveal/review/import, completed app review → immediate
Home Screen, full queue membership/order, and exact review IDs received by a
fresh peer. Previous pairing, shared JSON, and pending reviews are restored.
It complements, rather than replaces, the 14,000-row receive-limit gate.

For native update-menu behavior, build/install a dedicated Release Simulator
with `EXPO_PUBLIC_ORBIT_LAB_ORIGIN=https://slab.tail0da701.ts.net:9443`, then run
`ORBIT_SIMULATOR_UDID=<UDID> bun run ios:native-update-smoke` in this package.
It uses the same disposable vault fixture, adds/removes only private Serve port
9443, and verifies actual foregrounding without a process restart, immediate
native/JavaScript offers without completing a review, Later suppression, the platform's installer handoff,
same/missing native release fallthrough to JavaScript checks, and saved reviews
across relaunch. Set `ORBIT_NATIVE_SMOKE_CHECKPOINT_EXPORT` to a current iOS Expo
export to download/reload that real JavaScript checkpoint before running the
gate on an existing compatible native binary.
It never builds, installs, publishes to the real Lab, or accesses a phone.
Simulator handoff results cannot prove ad-hoc installation or data preservation
on a physical device.

## Font assets and licensing

Licensed DR/Raptor font files under `assets/fonts` remain ignored and must not be
committed or distributed. Expo's native font plugin bundles the app-owned files;
web-compatible files are staged in ignored `public/fonts`; Storybook serves
the app-owned `assets` directory.

This app, including its internal `src/ui`, is licensed under
`AGPL-3.0-or-later OR BUSL-1.1`. Fonts retain their separate proprietary licenses.
