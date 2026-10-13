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

## Local development

Requirements: Bun, Node 22.13 or newer, and a private vault configured outside
the checkout. iOS builds also need macOS, Xcode, CocoaPods, the existing signing
identity, and the ignored proprietary font assets described in
[the app readme](packages/app/Readme.md).

```sh
bun install
bun run build
bun run test
bun run lab:dev
```

`lab:dev` builds/watches the retained packages, runs the single-writer backend,
and starts Metro/web on port 8081. It defaults to
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
embedded or cached bundle without a startup network wait and checks for updates
in the background. The native review menu also offers an explicit update check
and confirmation before reloading. Metro/Fast Refresh is the connected editing
loop, not the durable offline bundle.

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

## License and origins

License files are unchanged. Libraries use Apache 2.0; the app (including
`src/ui`) and server use `AGPL-3.0-or-later OR BUSL-1.1`. Proprietary font assets
are not distributed with the repository and have separate licenses.

Orbit was created by Andy Matuschak and develops the mnemonic-medium concept
co-created with Michael Nielsen. This personal branch is not a release of new
public Orbit behavior; public-product documentation and contribution history
remain on the preserved branch.
