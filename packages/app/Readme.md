# @withorbit/app

This package contains the main Orbit GUI app for the web, iOS, Android, and macOS. It's built [React Native](https://reactnative.dev) (via [Expo](https://docs.expo.io) with [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)); the web app is built with [react-native-web](https://github.com/necolas/react-native-web).

- Local development
  - First, make sure all the libraries are built by running `bun install && bun run build` from the monorepo root.
  - Install [`watchman`](https://facebook.github.io/watchman/docs/nodejs.html) with `brew install watchman` (the pure-JS file watcher will run out of file handles).
  - Start up a local instance of the backend: see `packages/backend/Readme.md` for details.
  - To run the Orbit web app: `bun run web`
  - To smoke-test the embedded web flow against the local Firebase emulators: `bun run smoke:web` for legacy accounts, or `bun run smoke:web:hosted` with `ORBIT_AUTOMERGE_NEW_ACCOUNTS=true` emulators for Automerge. This starts its own Expo web server when needed. The thin-embed gate checks page-memory anonymous review/reload, current-page sign-in submission, and two review areas with publisher-relayed forgotten peer retries. Signed-in acknowledgements are checked against the account store; there is no anonymous journal or worker/fallback mode. It uses actual UI clicks in Bun's experimental WebView with Chrome, so Chrome (or another browser Bun can detect as its Chrome backend) must be installed.
  - To run the Orbit iOS app on the simulator: `bun run ios`
    - (You'll need to `cd ios; EXPO_USE_SOURCE=1 pod install` first; see [this issue](https://github.com/expo/expo/issues/12040) for background on the Expo workaround)
  - To run the Orbit iOS app on an attached device: `bun run ios --device [device name]`
  - To exercise native hosted sync from a root-only client through a
    production-sized schema-2 catalog, start the Firebase emulators and run
    `ORBIT_SIMULATOR_UDID=[dedicated simulator UDID] bun run ios:hosted-fetch-smoke`.
    Add `ORBIT_IOS_CONFIGURATION=Release` for meaningful launch-stage timings.
  - To run the Orbit macOS app:
    - Run `bunx expo prebuild -p ios` to generate the iOS project.
    - Run `bun run start` to start the Metro bundler.
    - Open the Xcode workspace, change the device to "My Mac", and run.
- Deployment
  - To build locally and deploy a new iOS build to internal TestFlight: `bun run deploy:ios:testflight`
  - For a faster physical-device dogfood loop, run `bun run deploy:ios:adhoc`. This makes the same focused release checks, creates a locally signed ad-hoc build, and uploads it to Firebase App Distribution for `andy@andymatuschak.org`. Firebase supplies the install link, so this path does not wait for TestFlight processing. A device must first be registered with `npx eas-cli@24.3.0 device:create`; EAS then includes that device in the ad-hoc provisioning profile.
  - To deploy the Orbit web app: `bun run deploy:web`

Unsure what a device's name is? Run `xctrace list devices`.

## Embedded review contract

An embed is a thin online client, not a local Automerge Repo. Anonymous reviews
exist only for the current page visit; the publisher relays their public progress
between sections and retains it for newly mounted iframes. Sign-in submits that
page's pending progress. Signed-in reviews advance only after authenticated HTTP
acknowledgement, using the hosted account Repo or the existing legacy API through
one transport adapter. Closing the page loses any unsaved intent. There is no
durable anonymous journal, worker owner, MessagePort RPC, or embed WebSocket sync.

A section fetches current account state when it enters the viewport or the
page/iframe regains visibility or focus. Users need not reload the page, but
embeds do not subscribe to live updates from other devices. `/review` and the
native app retain ordinary local-first Repo synchronization.

Ship the updated publisher component and embed app together for article-wide
anonymous progress relay. Ready/configuration/order/attachment messages keep
protocol version 1, so cached older publishers can still bootstrap the new
iframe and provide attachments; they lack only the new page-memory relay.
Old anonymous journals are intentionally ignored, not migrated or drained.

## Widget handoff checks

The app and WidgetKit extension compile the same Foundation helper. It atomically
replaces `orbit-widget-v3.json` in the App Group, coordinating on the shared
directory. The queue is disposable; pending reviews for every vault remain until
the app durably imports their stable IDs and acknowledges them with a fresh queue.
Opening or foregrounding the app drains reviews. Older widget formats and their
data are intentionally ignored; there is no conversion reader.

Run from `packages/app` on macOS:

```sh
bun run test:widget-projection-writer
bun run test:widget-projection-reader
bun run test:widget-projection-handoff
bun test src/vault/WidgetProjectionCoordinator.test.ts src/vault/widgetForeground.test.ts
```

The Swift checks compile the actual shared source under Swift 6. They cover
JSON projection reads, independent-process publication/review races, interrupted
writes, acceptance/import crash replay, cross-vault selective
acknowledgement, stale account intents, and malformed-journal preservation. The
crash-replay check uses a durable idempotent sink, not a running Repo; repository
persistence-failure/cold-reopen checks live in `store-automerge`'s direct Repo tests.
macOS file coordination needs access to its system service, so these Swift checks
may need to run outside a restricted execution sandbox.

`ios:hosted-fetch-smoke` also accepts a review through this JSON helper, takes
the sync server offline, and relaunches the cached app. It checks that the app
advances, acknowledges the pending review, and retains its exact observation in
ordinary Repo files after another process opens them. An uncached queue tail must
not block already available prompts; a missing authoritative task is still an
error when explicitly requested.

For real WidgetKit rendering and App Intents, install a freshly built `Orbit.app`
on a dedicated Simulator and place the medium Orbit widget at the top of its Home
Screen. Then run:

```sh
ORBIT_SIMULATOR_UDID=[dedicated simulator UDID] scripts/run_widget_ui_smoke.sh [Orbit.app path]
ORBIT_SIMULATOR_UDID=[dedicated simulator UDID] scripts/run_widget_layout_smoke.sh [Orbit.app path]
ORBIT_SIMULATOR_UDID=[dedicated simulator UDID] scripts/run_widget_link_smoke.sh [Orbit.app path]
```

The UI gate requires AXe. The link gate can save its screenshot with
`ORBIT_WIDGET_LINK_SCREENSHOT`. `scripts/seed_widget_layout_smoke.sh [UDID]`
publishes the layout fixtures for manual visual checks; all fixture tools use the
ordinary coordinated JSON path, never product UI branches or direct SQL writes.
Seeding resets only that fixture vault's pending reviews; other vaults' reviews
are preserved.

You'll need to copy Orbit's licensed proprietary app/native font files into `packages/app/assets/fonts`. Storybook serves the app-owned `packages/app/assets` directory, so its `/fonts/*` URLs resolve from `packages/app/assets/fonts`. For Expo web, stage the web-compatible font files in the ignored `packages/app/public/fonts` directory so its `/fonts/*` URLs resolve. These proprietary files must remain ignored and uncommitted: the fonts are non-free, and their licenses don't permit me to distribute them with the repository. For your local testing purposes only, you can find a demo distribution of the primary interface font, Dr, [here](https://www.productiontype.com/family/dr).

(At some point we should probably make a "no-trade-dress" flag you can set to get a "generic" build of Orbit.)

## Licensing

This app, including its internal UI source subtree at `src/ui`, is licensed under `AGPL-3.0-or-later OR BUSL-1.1`. Proprietary DR and Raptor font files under `assets/fonts` are not distributed with the repository and remain subject to their separate licenses.

---

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1
```
