# Personal Orbit Lab implementation plan

Approved scope, 2026-10-13. Orbit Lab is Andy's single-user iOS and web fork,
served by his laptop over Tailscale. Public Orbit stays on its existing
deployment. The goal is a short edit, test, and try loop with reliable offline
phone reviews, not a general self-hosting distribution or another public
account migration.

Lab replaces Orbit on Chonk. It has an independent vault seeded from a one-time
export, no live bridge to the original service, and no reminder service.
Batch export back to the original system remains a possible future operation,
not a runtime responsibility.

The independent fork is implemented and installed on Chonk. Browser and actual
Release Simulator durability/convergence/update gates have passed; Andy confirmed
the app and existing widget display the private queue. Physical app/widget
offline reviews and their exact later delivery, plus a private JS checkpoint
launch, are now confirmed. The strengthened 53-task Simulator gate covers cold
reopening after reviewed tasks leave the first-50 queue. Additional physical UI
checks remain follow-ups; the approved cloud retirement is complete with verified
recovery data retained. See the
[dated validation record](automerge-validation-record.md) for precise boundaries.

## Target architecture

Keep one implementation of the scheduler, task mutations, review sessions, and
per-task Automerge repository. Repo JS persists browser data in IndexedDB;
Repo Swift persists phone data in ordinary files. The widget keeps its existing
coordinated JSON queue and review outbox.

The laptop backend becomes primarily a single Automerge Repo with durable file
storage and a protected WebSocket endpoint. With reminders and signed-in embeds
absent, it need not run scheduling projections or an HTTP review-mutation
service. A small bootstrap endpoint returns the one vault's root URL. A separate
HTTP handler in that same process serves Expo update manifests and assets.

Use one private local configuration for the root URL, storage directory, and
pairing credential. Persist the root URL across restarts; missing configuration
must not silently create a replacement empty vault. Do not create an account
database, user directory, provisioning workflow, or generalized auth-provider
framework.

Keep live server data and pairing configuration in a stable application-data
directory outside Git worktrees and generated build output, for example
`~/Library/Application Support/Orbit Lab`. Archiving a checkout must not archive
or remove the only live vault. Update exports are separate, regenerable artifacts.

Bind the backend to loopback. Tailscale Serve provides the private HTTPS/WSS
entry point, with tailnet policy restricting access to Andy's devices. A paired
application credential protects vault bootstrap and sync. Keep credentials out
of tracked files, public bundles, URLs, and logs. Trusted private access to the
update endpoint is important because it distributes executable code.
[Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve)
provides HTTPS proxying without exposing the service to the public internet.

### One installed identity

Reuse `com.withorbit.native`, `group.com.withorbit.native`, the existing widget
identifier, and deep-link scheme, subject to signing-profile verification.
Changing the display name to Orbit Lab can make the installed build recognizable
without requiring another identity or a build-variant abstraction.

The same identity also means installation can retain the old app container and
App Group. Before replacement, preserve its pending app/widget reviews. Lab
then uses a fresh personal Repo directory and selection record; it never opens
the old public registry. Replace the disposable widget queue only after pending
reviews have been preserved. This is an explicit setup operation, not an old
format detector or a permanent conversion reader in the app.

The public app can replace Lab again if installed later. Do not upload Lab builds
to the public App Store/TestFlight release or reuse a public update channel.
Keep a local installable native artifact for recovery.

## What to remove

Make these deletions on a personal branch, preserving the current migration
branch and release receipts. Do not carry both products behind a Lab flag. The
public deployment continues to run its already released code.

| Responsibility                        | Personal fork disposition                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reminders and email                   | Delete server `notifications`, delivery SQLite, Mailjet/configuration/enrollment, email action tokens, reminder routes and client settings. Remove notification-specific repository methods and schema plumbing once the imported root no longer needs them.                                                                                                             |
| Firebase identity and account control | Delete Firebase initialization/token verification, Firestore account stores, sticky binding transactions, new-account provisioning, migration cohort checks, login/signup/access-code flows, cookie/session helpers, and personal-access-token UI. Replace them with one private connection setup.                                                                       |
| Legacy storage and sync               | Delete `LegacyReviewDatabase`, platform store factories, legacy mutation/event adapters, API sync, and the Android legacy fallback. Remove `store-fs`, `store-web`, `sync`, `api-client`, and SQLite dependencies after their remaining callers are removed or deliberately rewired. Keep the official Repo IndexedDB adapter; it is not the legacy `store-web` package. |
| Public backend and deployment         | Remove Firebase backend workspaces/configuration, emulator setup, GCP/COS/Docker deployment, cloud IAM/enrollment tools, Firebase App Distribution uploads, and TestFlight publication scripts from the personal build path and then from the fork. Preserve useful local build/signing checks.                                                                          |
| Public embeds and publisher           | Recommended first scope: remove the embed route, transient embedded-session/IPC code, publisher package, embedded-support package, and server HTTP review/attachment-submission routes. Public article embeds continue using public Orbit; they do not submit progress to Lab.                                                                                           |
| Multiple accounts and vaults          | Replace `AccountRepoPool`, eviction/recycling policy, per-account quotas/rate limits, account routing, and the multi-account client registry with one Repo and one selected vault. Keep graceful shutdown, stable Repo storage identity, bounded payloads, origin checks, and ordinary-file durability.                                                                  |
| Product and service extras            | Remove page-view analytics, public Sentry initialization/upload plumbing, onboarding/marketing/download/terms routes, login restoration state, and public-service fallback URLs. Keep local diagnostics and tests.                                                                                                                                                       |
| Migration operators                   | Use existing tools to capture the initial export, then remove live Firestore migration/freeze/cutover support. Retain a small private snapshot/export/restore command, not an account migration subsystem.                                                                                                                                                               |

Removing legacy packages requires checking callers beyond reviews. In particular,
`handleIngestEvent.ts` currently writes to the old `OrbitStore`. Do not leave
Shortcuts reporting success into an invisible legacy database. Initial Lab scope
is review, sync, and widget; disable unavailable ingestion entry points. A later
explicit step can route useful JSON/Anki/Shortcuts imports directly into the
shared Automerge mutation layer, reusing parsers without restoring legacy sync.

Dropping public embeds and initial ingestion support are scope proposals, not
claims that those capabilities are unimportant. They should be agreed before
deletion; neither is necessary to establish the personal review loop.

### Approved follow-up: reuse Bear ingestion

On 2026-10-13 Andy approved restoring the existing Markdown interpreter and
source/item reconciler, not a new Lab ingestion subsystem. The reconciler now
takes task definitions and returns shared vault mutations. Only its command-line
entry point selects the private configuration and opens an ordinary paired Repo
client with its own cache. There is no legacy-store shim, public API upload,
Firebase dependency, or live bridge back to the old service. Shortcuts remain
out of scope.

Completed after the Mac restart relieved disk pressure: parser/matching and
real paired-client gates pass. The import added 21 prompts and updated one note
title; a cold repeat changed nothing. The quiesced server export preserves every
original review and attachment. Inventory reads release Repo handles in bounded
batches rather than retain every task history.

Only the existing external `syncNotes.sh` Orbit stage now points at this checkout
and `lab:ingest`; the obsolete public event upload is removed. Both Orbit commands
were verified under its scheduled PATH. Do not run the whole wrapper merely as
an ingestion diagnostic: its other stages still export/synchronize notes and
publish website content. The validation record contains the exact data counts
and protected recovery path.

### Deletion inventory

Current-tree physical TS/JS/Swift runtime lines, including comments/blanks and
excluding named tests/testing/fixtures, give an approximate size for several
candidate areas:

| Area                                    | Lines |
| --------------------------------------- | ----: |
| Server reminders                        |   717 |
| Server accounts, auth, and migration    | 1,918 |
| Account Repo pool                       |   430 |
| Server embedded review handler          |   287 |
| App authentication and Firebase helpers |   500 |
| App embedded subsystem and route        | 2,394 |
| Legacy storage and sync packages        | 1,945 |
| Firebase backend runtime                | 3,598 |

These areas total approximately 11,800 lines before replacements. Some helpers
will remain or move. This is a gross inventory in the whole current tree, not
11,800 lines of new Automerge code or a promised net reduction. It excludes the
publisher, deployment scripts, legacy code inside other packages, and tests.
Measure the final runtime, dependencies, tests, and tools separately.

## What to retain

- `core` scheduling, task identities, observations, cloze/Markdown/math behavior,
  and typed mutations. Preserve existing historical observation IDs as data,
  even after deleting the code that generated legacy IDs.
- `PerTaskRepository`, the measured catalog materialization path, Repo JS/Swift
  adapters, and ordinary-file persistence. Do not introduce SQL indexes or
  another queue cache as part of this fork.
- Catalog conflict repair, generation selection, and existing rollover behavior
  initially. Two clients still make concurrent changes; deleting multi-user
  account routing does not make derived catalogs authoritative or eliminate
  their history growth. Evaluate further catalog simplification separately.
- Native admission ordering, document-fetch/retry behavior, and the pinned Repo
  fixes covered by regressions. Do not confuse production-routing deletion with
  permission to remove required platform workarounds.
- WidgetKit rendering and the shared JSON queue/outbox, including coordinated
  writes, stable review IDs, and selective acknowledgement. Simplify its
  multi-vault dispatch later without dropping cross-process durability.
- Local-first opening and queue reconciliation. Unreachable sync must not stop
  a cached review session. Keep cached prompts and referenced attachments;
  code availability alone does not make uncached tasks available offline.

## Application code updates

The daily-use phone build should be an optimized native build containing a
complete embedded JavaScript bundle and assets, plus `expo-updates` configured
for the private laptop endpoint. It opens the embedded or previously downloaded
bundle immediately, with no network wait on startup. Update checks run in the
background; a completed update is activated between sessions or through an
explicit refresh, never halfway through a review.

Expo owns device-side update persistence, asset download, and native runtime
compatibility selection. The private adapter still has to implement the required
manifest/asset protocol correctly; Expo's sample is a demonstration, not a
production-supported server. Keep the adapter restricted to iOS and the Lab
runtimes that actually exist. Do not add EAS hosting, channels, staged rollouts,
bundle diffing, a custom device cache/loader, or an update dashboard.
[Expo Updates](https://docs.expo.dev/versions/latest/sdk/updates/),
[startup strategies](https://docs.expo.dev/eas-update/download-updates/), and
[the official server example](https://github.com/expo/custom-expo-updates-server)
describe the supported client and the server boundary.

Add the native dependency directly to the app package and pin it consistently
with SDK 57. Use an SDK-supported native runtime version policy; verify that
Swift/native dependency changes require a new binary and ordinary JS edits do
not. Native-runtime matching is not a guarantee of application-data compatibility:
schema-changing experiments need a data snapshot before the update.

Metro/Fast Refresh remains the immediate development loop, primarily on the
Simulator and optionally on Chonk while connected. It does not turn the latest
development bundle into a durable offline checkpoint. The normal Chonk app uses
the cached-update path, without a dev-launcher step on cold launch.

Proposed local commands:

- `lab:dev`: build/watch only retained packages, run one backend, and start the
  web/Metro development server. Restart the backend gracefully and sequentially;
  never overlap writers to the data directory.
- `lab:checkpoint`: export the current iOS bundle/assets, prepare an immutable
  update directory, and publish its manifest only after the files are complete.
  Run the focused checks first; keep the current and previous checkpoint.
- `lab:install`: locally build/sign/install the native shell when Swift,
  entitlements, or native dependencies change. Reuse existing local device
  tooling; do not make cloud distribution part of this command.
- `lab:snapshot` and `lab:restore`: operate on the private vault with its writer
  quiesced. Data and pairing configuration stay outside tracked source and
  disposable build output.

For a JavaScript rollback, republish the older source as a new compatible
checkpoint; simply serving an older manifest may be rejected by update selection.
Restoring data is a separate deliberate operation. Measure export-to-download
and refresh turnaround rather than promising Fast Refresh latency for checkpoints.

## Implementation sequence and gates

### 1 Preserve the source and data boundary

Preserve the current branch and its pending public-publisher validation note.
Start `codex/orbit-personal-lab` from that source without rewriting or deploying
the public branch. Record baseline code/dependency counts before pruning.

Capture a consistent one-time export of the existing schema-2 vault, attachment
bytes, and any device/widget review tail. Deduplicate by observation ID and
validate task/observation counts, attachment references, and recent review IDs.
Do not clear old phone state to obtain this export.

Seed a fresh private root/catalog and independent Repo storage from those data;
preserve task identities, definitions, scheduling observations, and attachments.
The export connection is then closed. The private configuration contains no
public endpoint or credentials. Keep the original bytes and a usable old native
artifact as recovery material, not as runtime compatibility code.

Gate: the private corpus includes the latest reviews and validates independently;
no persistent connection back exists. The public deployment remains unchanged.

### 2 Establish the local server and web client

Reduce the server to one Repo, the existing durable storage adapter, pairing
admission, bootstrap, and local health diagnostics. Remove reminder startup and
account provisioning rather than injecting fake Firebase accounts forever.
Simplify the browser review route to use the private connection directly.

Use one paired credential and fixed vault selection, not login/signup, user
enumeration, token-refresh jobs, or a cohort flag. Cache selection independently
of server availability. Run tests with outbound public Orbit/Firebase/Mailjet
access blocked so accidental fallbacks fail visibly.

Gate: a seeded browser review survives closing/reopening and a server restart;
two independent clients converge, and invalid pairing is rejected. Neither
client reaches public APIs. Shutdown flushes the same Repo that handles sockets.

### 3 Prove the native offline update path early

Before signing a phone replacement, add the private update adapter and
`expo-updates` to an optimized Simulator build. Keep the existing task/UI flow;
seed fixtures through the real store, not special UI branches.

Gate:

1. Boot the embedded bundle with Metro/backend stopped.
2. Download checkpoint A and its assets, stop the laptop services, kill/relaunch,
   and prove A boots automatically without a launcher or network spinner.
3. Make a visible JS change, publish B locally, fetch it, and verify the update
   appears without reinstalling the native app.
4. Interrupt a download of C; offline relaunch must still use a complete bundle.
5. Reject a checkpoint targeting incompatible native code.
6. Record actual checkpoint/activation timings and verify no mid-review reload.

If the SDK 57/private adapter combination fails these gates, stop and resolve it
before device installation. Do not add a bespoke cached-bundle loader to bypass
the gate or quietly introduce an external update host.

### 4 Complete the deletion pass

Delete the responsibilities listed above, their callers, dependencies, tests for
retired products, build references, and deployment commands. Narrow the API
package to the small private wire contract if it still earns its package boundary.
Keep parsers/import operators only where they have an explicit private use.

Simplify the app's authenticated route layout, service configuration, account
selector/registry, and connection client. Keep one private configuration path;
`__DEV__` controls developer tooling, not backend identity. Remove old routing
names when they no longer describe the single-user implementation.

Gate: retained workspace build, types, lint, dependency installation, and focused
tests pass without Firebase emulators or Google credentials. Public-service
imports, URLs, and network calls are absent from runtime. Review code, source
volume, and package inventory show actual deletions, not a disabled second system.

### 5 Replace Orbit on Chonk

Verify the existing team/profile can install the same bundle and widget
identifiers. Locally sign the cached-update shell and install over the existing
app without uninstalling it. Chonk may need unlocking, pairing confirmation, or
Developer Mode; do not claim device acceptance from Simulator evidence.

Switch to the fresh private selection, preserve the old captured files, and
publish the private widget queue. Prime at least the next review session of task
documents and their attachments. Do not use the widget queue as an app cache or
load the full vault synchronously to achieve offline readiness.

Gate on actual Chonk and independent Chrome:

- Reviews converge in both directions while both are open.
- Stop the backend and update server; cold-launch, reveal, review, kill/relaunch,
  and verify local review persistence. Repeat with a prompt containing an image.
- Reconnect through Tailscale, including a non-LAN connection where available;
  verify review IDs converge once and the visible session reconciles correctly.
- The widget reveals, advances, imports its pending review once, and deep-links
  into Lab. Test with the app absent from memory as well as foregrounded.
- Fetch a new JS checkpoint on Chonk without native reinstallation; repeat the
  offline cold-launch test afterward.

Offline availability is bounded by downloaded task/attachment documents. If
uncached work remains, distinguish that from an empty queue or a failed local
vault; do not imply the phone contains the whole collection.

### 6 Finish the working environment and review history

Make the local commands dependable, retain concise logs and operator help, and
remove temporary fixtures/recovery branches introduced during this setup.
Adapt the existing native/browser/widget gates to the paired local service.
Keep concurrency, durability, conflict/rollover, attachment, and launch regressions;
retire account migration, public embeds, email, and legacy-store test suites.

Replace migration-era setup and rollout documentation in the fork with a short
local README, architecture note, and executable gates. Historical deployment
and incident records remain on the preserved migration branch rather than in a
second confusing documentation tree inside Lab.

Record the final runtime/dependency/tool counts and a short source reading order.
Use coherent commits describing the private server, direct client, offline code
updates, and deletions. Fold temporary scaffolding into the final responsibilities
so Andy need not review discarded implementations.

### 7 Retire the cloud dogfood deployment

Completed on 2026-10-13 after Andy's approval and the private device proofs.
The final cloud export/snapshot/image and a separate private Lab snapshot are
preserved; billable serving resources and old disks are removed, and monitoring
is paused. Public Firebase is unchanged. See the validation record for exact
resources, recovery hashes, and the remaining snapshot-only cost.

The approved plan was: the cloud dogfood service costs approximately
$1–2 per day and will have no users after the Lab cutover. Keep it unchanged
during setup, then shut it down after the private export and real-device gates
pass. Stop its reminder sender and sync VM, remove the dogfood-only load balancer
and serving resources that continue to incur charges, and retire the associated
resource-monitoring automation. Audit exact resource ownership before removal;
public Orbit's Firebase deployment, publisher/iframe, and other users are out of
scope. Stopped rollback VMs have no compute charge but their retained disks do.

Preserve the verified offline vault export and recovery snapshot before removing
any cloud data. Record what was stopped or removed, the remaining recovery
storage cost, and how the captured vault could be restored. Do not retain an idle
serving stack merely as rollback material.

## Completion criteria

The useful outcome is not merely another successful native build. Andy can start
one local command, change the shared app/server code, test through ordinary UI,
and try a JS checkpoint on Chonk without remote deployment. With the laptop
unreachable, Chonk still cold-launches a complete application, reviews downloaded
prompts, and persists them for later synchronization. Public Orbit is unaffected,
and the fork no longer contains an alternative Firebase product behind flags.
