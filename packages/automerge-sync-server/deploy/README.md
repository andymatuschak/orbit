# Orbit hosted sync runbook

See the [current Automerge architecture](../../../design/automerge-architecture.md)
for the client/server ownership boundaries this service supports.

This service is a single-instance, non-production durability spike. The client
cohort flag must remain off until every item in `PHASE3_GATES.md` is recorded as
passing against real infrastructure.

## Runtime shape

- Run Node 22.13 or newer with exactly one live service instance.
- Mount a durable, single-writer POSIX volume at a dedicated path and set
  `ORBIT_SYNC_STORAGE_ROOT` to a subdirectory on that mount. The adapter relies
  on same-filesystem atomic rename and directory `fsync`; a container's writable
  layer is not durable storage.
- Run the container as an unprivileged user which owns only that storage path.
- Expose HTTPS and WebSocket traffic at one dedicated origin. A reverse proxy
  must preserve WebSocket upgrades and must not log authorization headers or
  request bodies.
- Do not enable horizontal autoscaling. Account directories structurally
  isolate Repo instances, but there is no coordination protocol for two live
  writers to one account prefix.

The service exposes `GET /_health` for liveness and `GET /_ready` for readiness.
Content-free aggregate telemetry is available at `GET /_metrics` only when
`ORBIT_SYNC_EXPOSE_METRICS=true`; leave it disabled unless the route is
restricted to a monitoring network.
On `SIGTERM` it makes readiness fail, closes sockets with a restart code, flushes
loaded Repos, and drains filesystem operations before exiting. Clients obtain a
current Firebase ID token when they reconnect.

## Current production dogfood host

The one-account candidate deployed on 2026-09-11 is intentionally smaller than
a cohort deployment:

- `https://136-69-77-9.sslip.io` terminates TLS at a global external
  application load balancer and forwards WebSocket and control traffic to one
  `e2-micro` Container-Optimized OS VM, `orbit-automerge-sync-e2`, in
  `us-central1-a`.
- The VM runs
  `us-central1-docker.pkg.dev/metabook-system/orbit-automerge/sync@sha256:59fae8b319ca297bdd61df3fe50e4a5e102549dfc9a85a4b758d19d07167af0f`
  (the reminder-backoff candidate deployed on 2026-10-05). The previous
  known-good digest is
  `sha256:242e3721e95f45e3bf0f00e652a44a3773ec011e1d881ec4547ca3df5d6d0115`.
  Backoff adds two SQLite columns; an image-only downgrade to that previous
  notifier is not compatible. See the checkpoint and rollback notes in
  [REMINDERS.md](REMINDERS.md).
  Build replacement images with `docker buildx build --platform linux/amd64`
  and verify the published manifest's platform before switching the `e2-micro`
  VM. The Dockerfile rejects a non-AMD64 target and compiles TypeScript from
  source in a clean build stage; ignored local `dist` trees are excluded from
  the build context. An ARM64 image built on the operator's Mac briefly
  returned 503 on 2026-09-30; restoring the previous digest recovered public
  readiness before the corrected AMD64 image was deployed.
  The VM mounts the non-auto-deleting `orbit-automerge-data` disk. The startup
  script in this directory formats and mounts that disk, constrains the
  container to 700 MB, and admits port 8787 only from Google's load-balancer
  and health checker ranges. The VPC firewall applies the same restriction;
  the VM's direct public port is closed. With the one dogfood account loaded,
  the container used 378.5 MiB and the 1 GB host retained 302 MiB available
  on 2026-09-18.
- `orbit-automerge-sync@metabook-system.iam.gserviceaccount.com` has the custom
  runtime role in `gcp-runtime-role.yaml`, Firebase Auth viewer, Artifact
  Registry reader, log writer, and Secret Manager accessor on
  `orbit-automerge-reminders` only. The Firestore role has no entity-list or
  delete permission. The database, Auth, and logging bindings are intentionally
  time-bounded through 2026-10-24 07:00 UTC, as is the notifier secret access. The read-only
  `orbit-dogfood-monitor` bindings are not time-bounded.
- Cloud Logging stopped receiving the container's `gcplogs` stream when the
  previous runtime bindings expired on 2026-09-19. The server continued running
  with cached credentials, but a later container restart failed closed at the
  logging driver. On 2026-09-23 the three runtime bindings were extended,
  Docker was restarted to clear its credential cache, the same container was
  started, and fresh `gcplogs-docker-driver` entries plus public health and
  readiness were verified. Treat the 2026-10-24 deadline as an operational
  renewal gate; an expired log-writer binding can prevent container startup.
- `orbit-automerge-data-cutover-20260911` is the clean, quiesced persistent-disk
  checkpoint taken immediately after migration. A second quiesced checkpoint,
  `orbit-automerge-data-pre-e2-20260918`, preserves all dogfood changes before
  the architecture and machine-size migration. The stopped, detached
  `orbit-automerge-sync-1` ARM VM remains the short-term rollback host. The
  `orbit-automerge-recovery-drill` e2-small VM was stopped on 2026-09-23 with
  its disks retained, removing its idle compute cost. The
  complete host-loss restore drill is still an operational gate, not implied by
  either checkpoint.
- `orbit-automerge-data-pre-schema1-retire-20260930` is a quiesced snapshot
  taken immediately before the schema-1 retirement image switch. It reached
  `READY` with the same single-writer disk attached to a stopped VM. The
  corrected image reached public health/readiness, and fresh container logs
  reported its exact immutable digest with no error-severity entries in the
  immediate post-deploy check.

The `sslip.io` name is appropriate only for this personal dogfood run. Replace
it with an owned hostname and review the durable IAM policy before admitting a
cohort.

## Current iOS dogfood candidate

Orbit 1.0.0 (56), built from the `cc1b1c1d` working tree plus the peer-admission
fix recorded in this branch, was signed ad hoc for Chonk and
distributed only to `andy@andymatuschak.org` through Firebase App Distribution
on 2026-10-01. Its [tester release](https://appdistribution.firebase.google.com/testerapps/1:748053153064:ios:7583e31781730aff12bc1d/releases/67ujqqhd9r0f0)
contains the local-first launch, optimized catalog bridge, atomic first-card
paint, removal of client reminder plans, auth restoration, and a fix that waits
for an authenticated peer before fetching a remote-only repair document.
Repo Swift pending handles are no longer treated as locally available data.
All 92 app/plugin tests and the release preflight/native widget writer passed.
A real Release
Simulator run opened the 10,867-entry root-only fixture, fetched the selected
working set, persisted a review, relaunched locally, and reconciled a second
client's review. It also reproduced a local catalog conflict needing a
remote-only task: repair failed before the admission-order fix and passed
afterward without retry or reinstall. The IPA SHA-256 is
`b32524990ddbbcb8dd3cf04584a0062793f27e96904b76c1e371f3a4b1ab6dc1`.
On 2026-10-03 Andy confirmed normal startup, bidirectional Chonk/Chrome reviews,
offline review/reconnect, and kill/relaunch durability. Broader soak gates
remain separate from this focused acceptance.

The prior convergence-accepted candidate was Orbit 1.0.0 (49), built from `dcd5a23e`, signed ad
hoc for Chonk, and distributed only to `andy@andymatuschak.org` through Firebase
App Distribution on 2026-09-30. Its 18.3 MB IPA has SHA-256
`198a69c978471237552efdb3c841a9b5478c71233e9d1ff3c2066ea73b7cfc4f`.
Andy confirmed installation and reviews advancing in both directions between
Chonk and Chrome on 2026-09-30. The release preflight passed 21 hosted-review
and widget-projection tests plus the native projection-writer regression. A
fresh Release Simulator smoke opened a root-only vault with a 10,867-entry
catalog, fetched a bounded 53-document working set, persisted a review, and
reconciled a newer remote review after a warm relaunch.

The matching web artifact was deployed to Orbit Hosting with hosted sync
restricted to Andy's Firebase UID. The built and served main JavaScript bundle
matched byte-for-byte. Source maps were excluded from Hosting and were not
uploaded to Sentry in this rollout; error symbolication may therefore be less
complete until a separately approved upload.

The original App Store build-18 archive remains the exact artifact used to
prove that the Hermes bundle contains no Automerge Wasm and that the archive
contains exactly one `automergeFFI` package signature. Do not infer the
remaining ordinary-file-layout, oldest-device, offline-recovery, attachment,
or cross-client convergence gates from either archive or upload success.

The single-host reminder implementation was activated for Andy only on
2026-10-01; [REMINDERS.md](REMINDERS.md) records the checkpoint, copied
preferences, and first real Mailjet acceptance. The same day's browser bundle
was published with Andy's cohort gate and verified byte-for-byte against
Hosting. The old-email compatibility function alone was updated. Source maps
remain excluded (their URLs return SPA HTML, not map JSON).

On 2026-09-28 the single dogfood binding for `andy@andymatuschak.org` moved
from schema-1 root `automerge:3QJhyzDG2q4tFnfkp7EHqMQ8V1au` to audited
schema-2 root `automerge:3ot66RkvY5yAxknGrUTYba7EojN6`. The server was stopped
for the change. Snapshot `orbit-automerge-data-schema1-exported-20260928` and
private export `v1/review-exports/schema1-final-20260928.json` were durable
before the preconditioned Firestore update; public readiness passed after the
existing container restarted. The candidate source already contained the last
schema-1 review, so no review tail required replay.

## Account admission

The service fails closed per account. An account with no
`hostedVaultAccounts` record is rejected as unprovisioned, and an account whose
record is still in `legacy` mode is rejected as legacy. Both remain fully on
the legacy API. There is no global account census, completion sentinel, or
server startup gate.

Before migrating one selected legacy account, create its inert control record
from the backend package. Run this first as a dry run and then with `--apply`,
confirming the exact same email address:

```sh
bun packages/backend/scripts/provisionLegacyHostedVaultAccount.ts \
  --project-id metabook-system \
  --email person@example.com
bun packages/backend/scripts/provisionLegacyHostedVaultAccount.ts \
  --project-id metabook-system \
  --email person@example.com \
  --apply \
  --confirm-email person@example.com
```

The apply pass creates only that account's legacy-only control record and never
replaces an existing record. It does not enable hosted sync or disable legacy
writes. The migration command performs those changes later under its audited
freeze. Keep the email flag out of retained logs; the script emits only a
content-free account fingerprint and disposition.

The runtime identity needs only the Firebase/Auth permission required for
revocation-checked ID-token verification and transactional access to:

- `hostedVaultAccounts/*`;
- the legacy `users/*` notification fields read only during initial enrollment;
- creation of existing one-use review login codes in `accessCodes/*`.

Firestore rules deny clients direct access to the hosted control collections.
The legacy scheduler remains in the backend for unmigrated accounts;
`notificationMode: server` excludes Andy. The unused experimental plan worker,
endpoint, and Firestore index are removed from this branch. Their removal is
not an infrastructure deployment; any previously deployed plan function must
be retired with the next explicitly approved backend deployment. Daily evaluation needs
only the local SQLite routing/deadline index and root/catalog files.

Reminder enrollment is an explicit stopped-writer provisioning command, never
a sync startup prerequisite. Existing SQLite rows resume on ordinary restarts;
mail configuration failures log disabled reminders without disabling sync.
Follow [REMINDERS.md](REMINDERS.md) for the single-account command and handoff
ordering. Sync readiness alone does not establish notifier health.

## One-account migration

Deploy the backend change which rejects legacy mutations for accounts in
`migrating` or `automerge` before cutting over any account. The event-write
decision is read inside the same Firestore transaction which writes the event;
the attachment endpoints also reject new uploads at their boundary. This is
the short migration freeze, not a shadow writer or a second datastore.

Build the workspace first, then exercise one provisioned legacy account without
changing its control record:

```sh
node packages/automerge-sync-server/dist/migrateAccount.js dry-run \
  --email person@example.com \
  --project-id metabook-system \
  --bucket metabook-system.appspot.com \
  --storage-root /srv/orbit-data
```

The dry run pages through Firestore, downloads only attachments referenced by
the final task snapshots, builds a private temporary Repo, reopens every
document, compares logical projections and document heads, emits only counts
and hashes, and removes the temporary generation. It does not modify the
account or its legacy data. Retain the source and logical-vault hashes for the
apply comparison. The complete manifest hash is not expected to match because
a fresh conversion creates new Automerge document identities and audit
metadata.

For the cutover, stop the sync server and otherwise prevent any process from
opening the target volume. Choose and retain an opaque job ID, then run:

```sh
node packages/automerge-sync-server/dist/migrateAccount.js apply \
  --email person@example.com \
  --project-id metabook-system \
  --bucket metabook-system.appspot.com \
  --storage-root /srv/orbit-data \
  --job-id one-account-2026-09-10 \
  --confirm-server-stopped
```

Apply first changes only that account to `migrating`, which makes both the
legacy API and hosted Repo API refuse writes. It then takes a stable source
snapshot, records the exact watermark, builds and audits an ordinary-file Repo,
writes a private immutable manifest, atomically installs the generation, audits
it again, and transactionally binds the root. No legacy event, entity,
attachment, or notification state is deleted. A handled failure before install
returns the account to `legacy` and removes its private staging data.

If the process or host dies, the account deliberately remains frozen rather
than reopening an ambiguous writer. Repeat `apply` with the exact same job ID;
it re-audits and resumes a completed staging or installed generation. Never
invent a new job ID for an account already in `migrating`.

Firestore IAM can restrict entity access to a database but not to one account's
document paths. For the one-account production dogfood migration, the VM was
therefore not given database-wide query permission. The exact scanned image ran
under the existing operator identity on a trusted local host; while the server
was stopped, its sealed ordinary-file generation was copied to the empty
durable disk, compared with a private per-file hash manifest, and reopened by
the runtime identity before traffic resumed. This preserves the one-account
data boundary without introducing a long-lived migrator role. A future
whole-cohort migration should use a separately reviewed batch-migration
identity and execute directly against the destination volume.

The manifest records the exact imported review-observation IDs. To recover only
reviews made after cutover, stop the server and run:

```sh
node packages/automerge-sync-server/dist/migrateAccount.js export-reviews \
  --email person@example.com \
  --project-id metabook-system \
  --storage-root /srv/orbit-data \
  --output /secure/recovered-reviews.json \
  --confirm-server-stopped
```

The output is created with private permissions and is never overwritten. It
contains task/component IDs, outcomes, session IDs, and timestamps for only the
reviews not present in the import manifest. This is the escape hatch for the
personal dogfood period; do not roll an account back to legacy writes until
those reviews have been exported and deliberately reconciled.

## Configuration

Required production values:

- `HOST`, `PORT`
- `ORBIT_SYNC_ALLOWED_ORIGINS`
- `ORBIT_SYNC_STORAGE_ROOT`

Optional observability:

- `ORBIT_SYNC_EXPOSE_METRICS=true` enables `GET /_metrics`; it is disabled by
  default.

Resource and abuse bounds all have conservative defaults but should be chosen
from soak data:

- `ORBIT_SYNC_MAX_SOCKETS`
- `ORBIT_SYNC_MAX_SOCKETS_PER_ACCOUNT`
- `ORBIT_SYNC_MAX_SOCKET_LIFETIME_MILLIS`
- `ORBIT_SYNC_MAX_LOADED_ACCOUNTS`
- `ORBIT_SYNC_MAX_MESSAGE_BYTES`
- `ORBIT_SYNC_MAX_ADMISSION_BYTES`
- `ORBIT_SYNC_ADMISSION_TIMEOUT_MILLIS`
- `ORBIT_SYNC_MAX_MESSAGES_PER_MINUTE`
- `ORBIT_SYNC_MAX_CONTROL_REQUESTS_PER_MINUTE`
- `ORBIT_SYNC_MAX_STORAGE_BYTES_PER_ACCOUNT`
- `ORBIT_SYNC_STORAGE_CONCURRENCY`
- `ORBIT_SYNC_IDLE_REPO_TIMEOUT_MILLIS`
- `ORBIT_SYNC_RECYCLE_AFTER_REPO_CREATIONS`
- `ORBIT_SYNC_RECYCLE_RSS_BYTES`

The browser and iOS builds are independently gated by
`EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC=true`. A dogfood build may set
`EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN` to the temporary HTTPS load-balancer
origin; both the app and embedded SharedWorker use that value. Do not enable the
gate merely because the service process starts. The Phase 3 candidate cohort
includes access-code web `/review` sessions, signed-in embeds, and the iOS
review client. Existing legacy accounts stay on their legacy path; a
server-side-migrated account opens its bound root as a replacement on next
sign-in. Android remains outside the candidate cohort until it has a native
Automerge runtime and equivalent durability and reconnect evidence.

The production web artifact is shared by every account. During this one-account
dogfood, `deploy_web.sh` also sets
`EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS` to Andy's Firebase
UID. This selects hosted sync only for that identity; an empty allowlist means
that every signed-in account in the artifact is eligible.

## Native iOS client

The iOS client uses upstream `automerge-repo-swift` 0.3.2, pinned exactly,
which in turn uses the official Automerge Swift package. Repo Swift owns the
Repo v1 protocol, peer and sync state, document merging, and storage dispatch;
the JavaScript app owns only the bridge lifecycle and obtains a current Firebase
ID token for each connection. The native bundle therefore does
not include the JavaScript Automerge implementation or its Wasm payload. The
browser SharedWorker remains a separate build and still has its web-only
`automerge.wasm` artifact.

Repo Swift sends its upstream `join` as the first WebSocket frame. The native
client therefore supplies its Firebase ID token as `Authorization: ID …` in the
upgrade request. The router verifies the token with Firebase Admin, resolves the
bound account, and only then hands the socket to that account's Repo. Browser
WebSocket APIs cannot set that header, so browsers send the same credential in
a bounded first text frame before any Repo bytes. Both carriers enter the same
verification and account-routing path. Only a header-authenticated native
connection accepts a missing `Origin`; any supplied origin must still match an
exact configured origin. Credentials are never accepted in URLs.

Complete root, catalog, task, and attachment documents live in a small ordinary-file
`StorageProvider` under Application Support. Each document has one atomically
replaced snapshot plus ordered incremental-change files; Repo Swift decides
when to compact them. The Repo's global actor and Automerge merge operation are
the one serialization boundary, so a local save merges with any concurrently
arriving remote change before the provider persists it. SQLite is not in the
native Repo path. It remains only for the legacy database and the disposable
WidgetKit projection/durable widget-review outbox.
Opening a hosted root uses its catalog as the review index and fetches only the selected 50 task
documents. Those independent Repo requests start concurrently so Repo Swift's
500 ms resolver polling interval is paid once per network wave rather than once
per task. Attachments remain lazy and integrity-checked on demand.

Repo Swift 0.3.2 accepts UUID-sized (128-bit) document IDs. New attachment
documents therefore use the first 128 bits of their SHA-256 digest as the Repo
document ID while retaining the complete SHA-256 value as their content hash
and deterministic Automerge actor. This is a pre-cohort format boundary:
prototype vaults created with the earlier 256-bit attachment document IDs must
be recreated or explicitly imported before admitting iOS clients.
Review-queue scans rank catalog entries and materialize selected task documents.
The server reminder scan counts catalog due dates without opening any task.
Existing-root semantic
imports likewise copy attachment documents one at a time rather than retaining
the complete byte closure in memory.
Every reconnect asks the local Firebase session for a current ID token. Account
and root binding come from the stateless HTTPS root endpoints; the client learns
the server's persistent storage ID from Repo's authenticated peer metadata and
pins it for the lifetime of that local Repo instance. There is no sync-session
endpoint or server-side ticket store.

Native review writes are locally durable before the call returns and are sent
when the foreground WebSocket is available. iOS currently reports only
`Connected to Orbit Sync`: Repo Swift 0.3.2 does not implement Repo's
experimental remote-head subscription, so it must not claim that a particular
set of heads is already durable on the server. App suspension may pause live
sync; the ordinary-file provider retains local changes for the next foreground
reconnect.

Do not admit an iOS cohort until the physical-device and cross-client items in
`PHASE3_GATES.md` have dated evidence. In particular, test app termination after
a local review, attachment cache cleanup, account switching, credential refresh,
and web/iOS convergence through server restart.

The focused local durability/convergence gate is:

```sh
bun --cwd packages/automerge-sync-server test:durability-convergence
bun --cwd packages/app smoke:web:hosted
ORBIT_SIMULATOR_UDID=PASTE-DEDICATED-SIMULATOR-UDID \
  bun --cwd packages/app ios:review-smoke
ORBIT_IOS_CONFIGURATION=Release \
ORBIT_SIMULATOR_UDID=PASTE-DEDICATED-SIMULATOR-UDID \
  bun --cwd packages/app ios:hosted-fetch-smoke
```

For the hosted browser command, start the local Firebase emulators with
`ORBIT_AUTOMERGE_NEW_ACCOUNTS=true` (see the complete invocation and coverage
boundaries in `design/per-task-vault-v2.md`). It must own ports 19006 and 8787;
run it separately from the native hosted-fetch smoke. It drives real embedded
review/login UI and verifies hosted import and attachment bytes from a fresh
Repo client, then checks task edits, deletion, and catalog rollover in `/review`.
The complete suite passed twice on 2026-10-06, including immediate cold browser
reopen after rollover and a task created only in the new catalog. The earlier
sync-state-only crash gap and upstream fix are documented in the acceptance
results. Repo and its adapters are pinned to unmodified `2.6.0-alpha.5`, which
contains the fix; there is no local Repo patch or fork to carry forward.

The server command exercises native-compatible bidirectional protocol exchange,
volume restore, two independently edited offline replicas reconnecting after a
server restart, verification from a third clean replica, and a cached reader
restarting after an unwarmed catalog-generation handoff. It also retains
acknowledged sync state while deleting only a temporary reader's document
chunks, then verifies re-fetch against warm and restarted cold servers.
The review smoke
drives two reviews through the unchanged production UI with AXe, kills and
relaunches the app, and reads Repo Swift's ordinary files from outside the
process. The hosted-fetch smoke starts from a root-only client, fetches a
production-sized schema-2 catalog and 50 tasks through the real router, records
a review, verifies the persisted narrow working set, and measures a warm
relaunch. These are repeatable local regression gates; they do not substitute
for the multi-day physical web/iOS soak or the destructive production recovery
drill.

## Backup and restore

A recoverable backup comprises both:

1. a point-in-time snapshot of the complete storage root, including each
   account's persistent Repo storage ID and `reminders.sqlite` with its WAL;
   the notification attempt dates/counts and settings-link HMAC key cannot be rebuilt
   from task documents; and
2. the corresponding Firestore `hostedVaultAccounts` account-to-root mappings
   and migration modes.

For a planned snapshot, remove the instance from traffic, send `SIGTERM`, wait
for clean exit, then snapshot the unmounted or quiescent volume. The root
binding is sticky, but retain the Firestore export beside the volume snapshot so
the account namespace and document URL cannot be restored from mismatched
generations.

The recovery drill must restore into an empty replacement host and volume—not
over the original mount—and prove all of the following with a non-production
account:

- the server storage ID is unchanged;
- a fresh client can fetch the bound root and referenced attachment closure;
- a client holding newer local changes can reconnect and replay them;
- another account cannot load the same document URL from its private prefix;
- reminder preferences, attempt dates/counts, and settings-link key survive restore;
  a pre-backup settings link still works and today's reminder is not resent;
- the original host can remain destroyed.

Keep a dogfood-data restore quarantined from production traffic and outbound
email. Use an isolated account-store copy and no production reminder secret;
test settings POSTs only on the restored volume. A running-disk snapshot tests
crash recovery, not the clean-backup procedure above. Record which kind was used.
The 2026-10-03 local reminder integration copies a quiesced volume and exercises
both links generated by the actual email code, scanner-safe GETs, durable POSTs,
expired/tampered-token rejection, storage identity, and same-day send suppression.
It is not evidence of a cloud persistent-disk host-loss drill.

The automated integration test performs the same logical exercise with
temporary directories. It is necessary regression coverage, but it is not a
substitute for the persistent-disk host-loss drill.

## Memory and recycling

The pool evicts an entire idle account Repo after its configured timeout and
caps both loaded accounts and sockets. It does not reproduce Automerge Repo's
pending document-level cache GC. Monitor RSS, heap, loaded documents, cold-load
latency, capacity rejections, and storage bytes. When `shouldRecycleProcess`
becomes true, drain and replace the sole instance serially; never overlap old
and new writers. The quota index scans file sizes rather than loading every
stored Repo value, so a cold capacity check does not itself materialize the
account's persisted data.
