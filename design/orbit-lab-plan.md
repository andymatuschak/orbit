# Personal Orbit Lab: scope and remaining work

Approved 2026-10-13; maintained after the private cutover. The original setup
sequence is in Git history. This document records the current agreement, not a
second implementation checklist. See [the architecture](automerge-architecture.md)
for ownership, [the reading guide](automerge-review-guide.md) for source pointers,
and [the validation record](automerge-validation-record.md) for dated evidence.

## Purpose and boundaries

Lab is Andy's single-user iOS and web fork, served by his laptop over Tailscale.
The goal is a short edit → test → try loop with reliable offline phone reviews,
not a general self-hosting product or another public account migration.

Lab replaces Orbit on Chonk using the existing app/widget identities and App
Group. Its independently seeded vault has no live bridge to public Orbit.
Batch export remains an explicit offline operation. Never uninstall the app or
clear its data to work around signing, update, or connectivity failures.

The public Firebase deployment and public article embeds are out of scope and
unchanged. The private fork no longer carries Firebase accounts, reminders,
Mailjet, public embeds/publisher, analytics, legacy stores/sync, cloud deployment,
or multi-account provisioning. Android and Shortcuts ingestion remain outside
scope; do not retain silent legacy destinations for them.

The old cloud dogfood serving stack was retired on 2026-10-13 after the private
cutover. Its final export/image/snapshot and a separate Lab snapshot are retained;
the resource-monitoring automation is paused. Exact recovery material, removals,
and residual snapshot storage cost are recorded in the validation ledger.

## Implemented system

- One TypeScript implementation of task mutations, scheduling, review sessions,
  catalog selection/repair, and queue ordering serves native and web clients.
- Repo JS uses IndexedDB in browsers and atomic ordinary files on the laptop.
  Repo Swift owns phone documents and ordinary-file persistence. Swift does not
  implement another scheduler, index, or task model.
- One root names catalog generations and attachments. The catalog is the only
  review index; task documents and observations are authoritative. Retain the
  documented [catalog handoff tradeoff](catalog-rollover.md#accepted-handoff-risk),
  not another task registry, SQL index, or launch frontier.
- WidgetKit uses one coordinated JSON queue/outbox. Stable review IDs and
  selective acknowledgement preserve accepted reviews across processes and
  crashes. The widget projection is not an app launch cache.
- The original Bear/Markdown interpreter and reconciler produce shared mutations.
  Only the CLI chooses the private configuration and opens an ordinary paired
  Repo client. No public API upload or legacy event-store shim remains.
- Expo owns embedded/downloaded application code, asset integrity, and runtime
  compatibility. The same private backend serves the narrow iOS update protocol
  and ad-hoc native releases; there is no custom phone bundle cache or EAS host.

The FSRS experiment selects its policy in the root, with personalized weights
and shared mixed-backlog ordering. Historical due dates remain unchanged until
a component's first new review. See [the app readme](../packages/app/Readme.md#fsrs-experiment)
for rating, retry, calibration, and queue semantics.

The existing external `syncNotes.sh` Orbit stage points at `lab:ingest`. Do not
run the whole wrapper just to diagnose Orbit: its other stages export/synchronize
notes and publish website content.

## Operational contract

Live Repo files, pairing configuration, captures, and backups stay outside Git
and generated build output, normally under
`~/Library/Application Support/Orbit Lab`. Archiving a worktree must not remove
the only live vault. Missing root data is an error, not an invitation to create
an empty replacement.

The backend binds to loopback. Private Tailscale Serve supplies HTTPS/WSS; do not
enable public Funnel. A pairing key protects bootstrap/sync and stays out of
tracked files, public bundles, URLs, and logs. Update assets rely on private
network access because Expo/iOS installer requests do not inherit pairing headers.

One managed user LaunchAgent supervises the daily-use backend. The kernel-held
`.writer-lock` prevents concurrent writers and releases ownership after a crash;
never delete its stable file. Offline snapshot/import/calibration tools use the
same exclusion boundary. Stop the backend before snapshot/export/restore work;
restore creates a new directory instead of overwriting the live vault.

Cached startup does not wait for bootstrap, authentication, or sync. Offline
availability is limited to downloaded task documents and attachments, not all
tasks named in the catalog. The first 50 tasks are the display working set, not
the complete sync set: cached task histories are re-enrolled in the background
so reviews still upload after their tasks leave the queue. Repo Swift currently
has no handle eviction API; batching does not bound its total retained memory.

Launch and real foreground transitions check native and JavaScript releases.
Available updates prompt immediately, even over a revealed answer, but pending
durable writes defer the offer. Applying code requires approval; Later suppresses
the same offer for the mounted session, and the menu can explicitly reoffer it.
Offline automatic checks stay quiet. Expo may activate a downloaded compatible
checkpoint on a subsequent cold launch. Native changes require a new binary and
runtime; data compatibility separately requires a snapshot before schema changes.

Use the supported commands in [the root readme](../Readme.md): `lab:service`,
`lab:dev --client-only`, `lab:checkpoint`, `lab:install`, `lab:ingest`, and the
offline seed/export/snapshot/restore tools. Backend watch mode requires stopping
the managed writer first. Use `lab:install` for native builds so the pinned
upstream Rust merge fix and Repo Swift WebSocket receive-limit patch are applied.
Remove the local Rust build when an official Swift XCFramework includes the fix;
the client does not own an alternative merge/recovery protocol. Expo 58 now owns
scene startup, so the former scene-lifecycle adapter is removed. A JavaScript
rollback is a new compatible checkpoint from older source, not a data restore or
necessarily an older manifest pointer.

## Validation and remaining follow-ups

The validation ledger records successful real browser/Release Simulator gates,
physical cached-code/offline app/widget review delivery, native ad-hoc update
installation, and real-vault FSRS projection catch-up. These are separate proofs:
unit tests or a Simulator installer handoff do not prove physical installation.

Keep the focused gates runnable through ordinary store writes and AXe/simctl,
without UI-only fixture branches. They cover concurrency, task-first durability,
conflict/rollover repair, attachments, >1 MiB catalogs, cold/offline reopening,
out-of-window reviewed tasks, and immediate update offers. `bun run checkall`
checks the retained workspace without Firebase emulators or Google credentials.

Remaining maintenance boundaries:

- Observe the next automatic immediate update offer on Chonk. The real Simulator
  gate passes; the initial activation on Chonk was through the existing menu.
- Retain the narrow upstream Repo/Expo workarounds until their removal gates
  pass. Their source comments identify why they exist; do not replace them with
  another transport, cache, or retry framework.
- Measure memory growth before introducing document-eviction machinery. Likewise,
  profile scheduling hot paths before adding caches or another index.
- Keep the review history coherent when preparing the next commit series. Do not
  carry discarded scaffolding or compatibility code merely to explain old incidents;
  dated receipts belong in the ledger and preserved migration branch.
