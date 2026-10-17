# Orbit Lab

This branch is Andy's private, single-user Orbit: native and browser reviews,
an iOS widget, and one laptop-hosted Automerge sync process. It is intended to
make a source edit → test → try loop lightweight, not to provide a general
self-hosting product.

Public Orbit remains on its existing deployment. Its migration implementation,
release receipts, and historical incidents are preserved on
`codex/automerge-phase-3-native`. Lab has independent data and no live bridge to
that service. There are no Firebase accounts, reminders, public embeds, or cloud
deployment commands in the Lab runtime. Android and Shortcuts ingestion are
outside the initial scope.

Start with [the architecture](design/automerge-architecture.md), then
[the code reading guide](design/automerge-review-guide.md). The
[implementation plan](design/orbit-lab-plan.md) records the scope and cutover
gates; [the validation record](design/automerge-validation-record.md) distinguishes
proved behavior from pending native/device checks.

Source work is published to remote branch `lab`. This checkout's local branch
can have a different name; use `git push origin HEAD:lab` explicitly. Pushing
source does not deploy public Orbit or publish a phone update: the private
checkpoint and local service commands below are separate operations.

## Local development

Requirements: Bun, Node 22.13 or newer, and a private vault configured outside
the checkout. iOS builds also need macOS, Xcode, CocoaPods, the existing signing
identity, and the ignored proprietary font assets described in
[the app readme](packages/app/Readme.md).

Automerge currently has a temporary upstream Rust allocation fix shared by the
JavaScript dependency and native build recipe. [Its patch and pinned rebuild
notes](vendor/automerge/Readme.md) explain the generated npm artifact and the
condition for removing it. Normal installs need no Rust toolchain; `bun run test`
includes the bounded-memory cold-open regression.

```sh
bun install
bun run build
bun run test
bun run lab:service install
bun run lab:dev --client-only
```

The user LaunchAgent keeps the single-writer backend running across terminal
closure and process crashes. `lab:service status` reports readiness;
`lab:service restart` gracefully loads rebuilt server code. `lab:dev --client-only`
builds/watches the retained packages and starts Metro/web on port 8081 without
owning that backend. For backend auto-reload, stop the managed service and run
ordinary `lab:dev`; the two writers must not overlap. Configuration defaults to
`~/Library/Application Support/Orbit Lab/config.json`; use
`bun run lab:dev --config <private-config>` or `ORBIT_LAB_CONFIG` to choose
another private configuration. The browser's first visit asks for the private
server origin and pairing key. Later visits open that selected local cache
without waiting for the laptop.

The server listens on loopback. Tailscale Serve is the private HTTPS/WSS entry
point for the phone; do not expose the update endpoint with Funnel or a public
proxy. Normal development needs no Google/Firebase login or permissions.

## Native builds and JavaScript checkpoints

Lab replaces Orbit on the phone, reusing its app identity and App Group. Preserve
the old app's pending reviews before the first replacement; never uninstall to
work around signing or connectivity. Initial Simulator and physical-device
acceptance are still separate gates.

```sh
bun run lab:install --simulator <UDID> --install
bun run lab:install --device <UDID> --install --output <local-artifact-directory>
```

These commands build an optimized local app; they do not upload to TestFlight,
Firebase, or EAS. A native change needs a new binary and native runtime version.
Ordinary JavaScript changes can be published as a local checkpoint:

```sh
bun run lab:checkpoint
```

The command derives the private origin and native runtime from app configuration
and the export destination from the private configuration. To target another
laptop, set `EXPO_PUBLIC_ORBIT_LAB_ORIGIN` consistently when building the shell,
starting development, and publishing checkpoints. Never put the pairing key in
that environment variable or the bundle.

Use the installed binary's actual runtime version. `expo-updates` opens the
embedded or cached bundle without a startup network wait. Launch/foreground
checks offer available native and JavaScript updates immediately, except while
a durable write is pending. Applying either requires approval. The menu can
explicitly check again after Later. Metro/Fast Refresh is the connected editing
loop, not the durable offline bundle.

For a native-code change, publish an ad-hoc IPA to that same private server:

```sh
bun run lab:install --device <registered-UDID> --publish --build-number <new-integer>
```

This archives on the Mac without needing the phone connected, exports through
Xcode's registered-device distribution signing, and publishes only after the
app and extension profiles include that device. The update menu checks native
builds independently of Expo runtime matching and offers **Install**. iOS owns
the download, confirmation and replacement; it is not a silent self-update.
Keep Tailscale connected and the laptop reachable until installation finishes.
Never delete the existing app. Published build numbers are immutable; choose a
larger number for the next build. The signed IPA/manifest remain outside Git in
the configured updates directory. Signing/profile expiry still applies.

## Data and recovery

Keep live Repo files, pairing configuration, captures, and backups outside Git
and generated build output. Setup explicitly imports an existing vault; startup
refuses missing root data rather than silently creating an empty replacement.

Stop the backend before taking a snapshot or exporting its live files:

```sh
bun run lab:snapshot --config <private-config> --destination <new-backup-directory>
bun run lab:restore --snapshot <backup-directory> --destination <new-restore-directory>
bun run lab:export --source <quiesced-repo-directory> --root <automerge-root-url> --output <new-private-json-file>
bun run lab:seed --vault-json <private-json-file> --destination <new-private-repo-directory>
```

Snapshot/restore create new directories rather than overwrite existing data.
The snapshot includes the private pairing configuration: protect it like the
vault. Restoring does not automatically switch the running service, change the
phone's selected root, or restore code checkpoints. A JavaScript rollback and a
data restore are deliberately different operations.

## Bear note ingestion

The original Markdown interpreter and source/item reconciler are retained. They
write through the same Automerge repository as reviews, not a legacy event store
or the public service:

```sh
bun run lab:ingest-markdown --directory <notes-directory> --dry-run
bun run lab:ingest-markdown --directory <notes-directory>
```

The server must be running. The command uses the private server configuration
and a separate ordinary Repo client cache. Existing IDs and reviews survive
unchanged prompts, note renames, and unambiguous moves. A prompt's
`[☉](orbit://task/TASK-ID)` badge also preserves its identity across wording edits;
without a badge, content changes still delete and recreate the task.

Import never writes Markdown. To add missing badges, run
`bun run lab:prepare-stamps --directory <disposable-copies>`, then let the source
owner accept those proposals before importing its accepted exports. In the Bear
workflow, the separate Bear tool owns temporary files and conditional native
saves; Orbit does not call it. See [badge preparation](packages/interpreter/Readme.md#prepare-disposable-stamps)
and [the ingester readme](packages/ingester/Readme.md) for matching, complete-source
semantics, private reports, and delivery boundaries. The JSON interpreter/ingester
commands remain available for other callers.

## Packages

| Package                 | Responsibility                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| `core`                  | Task identities, observations, mutations, scheduling, attachment integrity |
| `store-shared`          | One per-task repository, catalog/index policy, queue and conflict repair   |
| `store-automerge`       | Repo JS document adapter, IndexedDB bytes, import/fixture codecs           |
| `automerge-sync-server` | One paired Repo, atomic file storage, bootstrap and update assets          |
| `app`                   | Shared review UI, native Repo Swift bridge, local opening, widget handoff  |
| `api`                   | Private pairing and admission message types                                |
| `sample-data`           | Independent test fixtures                                                  |
| `interpreter`           | Existing Bear/Markdown parsing and stable source/item identities           |
| `ingester`              | Existing source reconciliation, shared task mutations, paired CLI          |

## License and origins

License files are unchanged. Libraries use Apache 2.0; the app (including
`src/ui`) and server use `AGPL-3.0-or-later OR BUSL-1.1`. Proprietary font assets
are not distributed with the repository and have separate licenses.

Orbit was created by Andy Matuschak and develops the mnemonic-medium concept
co-created with Michael Nielsen. This personal branch is not a release of new
public Orbit behavior; public-product documentation and contribution history
remain on the preserved branch.
