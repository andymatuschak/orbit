# Orbit Lab client

This package contains the personal iOS and browser review clients. Both use one
shared task repository and review/session implementation. Web uses Repo JS with
the official IndexedDB storage adapter; iOS uses Repo Swift with ordinary files.
There is no Firebase login, public API fallback, embed, reminder settings page,
or legacy store selection.

The first launch pairs with a private origin and key. The installation keeps one
selection under `com.withorbit.lab.connection.v1`, with a fresh `lab-…` local
store ID. It never reads public Orbit's former vault registry. Subsequent launch
opens locally cached prompts without requiring the laptop. An uncached first
launch still needs the server; a known catalog without any readable prompt is
unavailable, not an empty review queue.

## Development and native code

Run `bun run lab:dev` from the repository root. Metro serves the web client and
the connected development loop. Set `EXPO_PUBLIC_ORBIT_LAB_ORIGIN` to the private
Tailscale HTTPS origin, or loopback HTTP for Simulator-only work; the pairing
key must never be an `EXPO_PUBLIC_` variable.

`bun run lab:install --simulator <UDID> --install` or
`bun run lab:install --device <UDID> --install` makes an optimized local binary.
The bundle identifier and App Group remain `com.withorbit.native` and
`group.com.withorbit.native`; Lab replaces Orbit instead of installing alongside
it. Preserve pending reviews before first replacement. Installation does not
delete the app container.

Expo generates the native project. Keep changes in `modules`, `targets`, and
`expoPlugin`, not generated `ios` output. The scene lifecycle adapter remains
until Expo's released template provides equivalent wiring; its source records
the upstream issue and removal conditions. Repo Swift's admission-order and
remote-change notification workarounds remain covered by regressions.

## Offline application code

The installed app includes a complete bundle/assets. `expo-updates` selects the
embedded or downloaded checkpoint immediately, then checks the private endpoint
in the background. The native menu's **Check for app update** downloads a
checkpoint and asks before reloading; it cannot reload during a pending
review/delete/undo write. Otherwise a completed checkpoint applies on the next
cold launch. Diagnostic logs identify the running update without test-only UI.

Publish with the root `lab:checkpoint` command and the binary's matching native
runtime version. Bump that version and rebuild when Swift, native dependencies,
or entitlements change. Metro's latest bundle is not an offline checkpoint.
The complete native download/kill/relaunch/rollback gates are recorded separately
in [the validation record](../../design/automerge-validation-record.md).

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
to create 53 ordinary tasks (three named prompts and 50 fillers) in a disposable
Repo and temporarily select it through the app's existing AsyncStorage record.
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

## Font assets and licensing

Licensed DR/Raptor font files under `assets/fonts` remain ignored and must not be
committed or distributed. Expo's native font plugin bundles the app-owned files;
web-compatible files are staged in ignored `public/fonts`; Storybook serves
the app-owned `assets` directory.

This app, including its internal `src/ui`, is licensed under
`AGPL-3.0-or-later OR BUSL-1.1`. Fonts retain their separate proprietary licenses.
