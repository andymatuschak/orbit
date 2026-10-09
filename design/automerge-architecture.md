# Automerge architecture after the migration spike

This note records the current experimental architecture. Start with the
[review guide](automerge-review-guide.md) for code entry points and test gates. The governing
rule is that Automerge Repo owns document persistence, merging, and sync;
Orbit-owned code should express domain mutations or adapt a platform boundary,
not maintain a second database or protocol.

## Authoritative data paths

| Surface                         | Automerge runtime         | Durable local storage                           | Network                   |
| ------------------------------- | ------------------------- | ----------------------------------------------- | ------------------------- |
| Web `/review`                   | TypeScript Automerge Repo | Official Repo IndexedDB adapter                 | Repo WebSocket protocol   |
| Signed-in embeds                | No client Automerge Repo  | None; server acknowledges accepted reviews      | Authenticated HTTP        |
| Anonymous embeds                | No Automerge Repo         | None; publisher/iframe page memory only         | None until sign-in        |
| iOS app                         | `automerge-repo-swift`    | Small ordinary-file `StorageProvider`           | Repo WebSocket protocol   |
| Hosted service                  | TypeScript Automerge Repo | Atomic filesystem adapter on one durable volume | Authenticated Repo router |
| Android and unmigrated accounts | Legacy Orbit store        | Existing SQLite/API path                        | Existing API sync         |

Andy's live dogfood account is bound to schema 2: a tiny generation root, one
replaceable catalog used directly as the review index, and one authoritative
document per task. New hosted accounts and server-side account migrations
create only schema 2. Anonymous embeds do not create a vault. The original 64-shard root is preserved in the
stopped-disk snapshot, but current web and native clients no longer open it.
The legacy event adapter exists only below the unmigrated-account fallback.

There is no Phase 1 shadow database. Existing account history will be migrated
on the server. When an account is marked `automerge`, the client opens the root
bound to that account as its source of truth. Embeds instead use a thin HTTP
client: the server reads and changes that same root. Before sign-in, an embed
uses the publisher's task seeds and page-memory reviews. Sign-in submits the
current page's anonymous progress to the selected account. There is no durable
anonymous journal, anonymous vault, owner election, worker, or vault-port RPC.
New-account root resolution creates and durably saves an empty vault
server-side before transactionally publishing its sticky binding. Legacy or
incompletely migrated accounts never receive an empty replacement.

The shared TypeScript `PerTaskRepository` owns mutation, queue, conflict repair,
and catalog policy for web and native. Its document adapters perform reads,
creates, patches, and local durability barriers using their platform's Repo.
An awaited `apply()` completes those local barriers and returns no receipt.
Actual task heads are used only for derived catalog freshness; there is no
synthetic whole-vault heads vector. The one `HostedReviewDatabase` owns
queue subscriptions, refresh coalescing, durable review writes, attachment URL
lifetime, and close. Native and web opening functions provide file/Blob URLs
and the native WidgetKit hook, not separate review workflows.
The native document adapter owns its Repo-change subscriptions directly and
removes them on close; the WebSocket transport is not an event-forwarding owner.
Opening returns the verified registry entry, not a second copy of its root
coordinates. The review route opens the database directly, without a manager
object forwarding every database operation.
Normal web mutations change Repo-owned handles directly, without exporting,
reloading, and merging binary copies. Operational import tools retain explicit
byte-backed access. Review seeds create missing tasks only; reviewing an existing
task cannot rewrite its definition or resurrect a deleted task.

Native creation and attachment reads also use Repo-owned handles directly.
Swift creates and persists the document before returning its materialized JSON
and URL; JavaScript does not encode bytes and import them back into Swift.
New tasks are planned once and created in their final state, not saved as an
empty seed and immediately rewritten.

Queue reads can use a shorter local working set while absent tail documents
fetch in the background. If no usable prompt is local, they wait for the selected
documents rather than report an empty queue. Present malformed or conflicting
authoritative documents still fail; explicit task/full-vault reads stay strict.
Session exhaustion is not a claim that the entire vault has no due work.

## Small non-authoritative state

The device-local registry stores only the coordinates needed to reopen local
Repo storage: an account/service/root/local-store tuple for each hosted cache.
Embeds do not use this registry or reopen an anonymous local store.

Logical vault identity remains in the root/catalog, while the hosted account-to-root
binding remains on the server. The registry has no vault picker, display names,
migration receipts, legacy IDs, credentials, or task data.

WidgetKit does not participate in the app's live Repo. One `orbit-widget-v3.json`
file holds the selected vault, disposable queue, and pending reviews for all vaults.
The same Foundation implementation is compiled into both app and extension:

- the queue is a disposable review projection rebuilt by the app;
- a widget review is first written to a durable, idempotent outbox; and
- the app imports those typed review mutations into the authoritative store
  before removing acknowledged IDs and installing a fresh queue in one commit.

All read-modify-write operations run inside `NSFileCoordinator` on the stable
parent directory, with atomic replacement and file/directory persistence barriers.
No Repo or network work occurs inside that coordination. App imports copy pending
IDs, apply outside the lock, then reread the latest JSON to acknowledge only that
batch; newly arriving reviews and other vaults' reviews survive. Opening or
foregrounding the app drains pending reviews. Earlier experimental SQLite
handoffs are not read or converted; old widget data may be discarded.

The app never reads the widget projection as its own launch queue. Repo changes
replace the not-yet-seen tail of the review queue and append newly due work,
while the prompt already visible remains stable. All app review writes go
directly to Repo Swift and become durable in ordinary files before the UI
advances.

No other Automerge client uses SQLite for document storage or write
serialization. On iOS the Repo Swift global actor is the serialization boundary
for local document changes, remote merges, and ordinary-file persistence.

### Thin embedded reviews

`EmbeddedReviewSession` owns one transient page session for both account types.
`embeddedReviewAPI` selects the hosted HTTP endpoints or the existing legacy
tasks/events/attachment API; this is a transport adapter, not a second model or
lifecycle. Hosted requests authenticate inside the Orbit iframe and select the
account's bound Repo server-side. Account IDs, credentials, private task states,
and document URLs are not sent through the publisher.

The publisher keeps page-memory anonymous review history, deduplicated by stable
session/request IDs. It relays that public progress to other sections and replays
it to newly mounted iframes. This deliberately trusts the publisher's account
of anonymous progress. Immutable task seeds and section order still come from
the publisher, and attachment bytes are fetched only for display or an upload,
through the existing bounded, allowlisted handoff.

Signed-in reviews are online-only: a mark advances after the server response
acknowledges it. Pending intent remains in iframe memory for a same-page retry,
including an ambiguous lost response; stable IDs prevent applying that review
twice. Closing or reloading the page loses anonymous progress and any unaccepted
signed-in work. There is no promise of offline embed durability.

A section refreshes account state when it enters the viewport, the page becomes
visible again, or the iframe regains focus. This is the ordinary activation read,
not a user-facing reload requirement. There is no live account-state broadcast,
WebSocket subscription, or polling loop in an embed. Ordinary `/review` and the
native app keep their local-first Repo synchronization.

The updated publisher component is needed for article-wide anonymous relay.
Protocol version 1 retains the existing ready/configuration/order/attachment
shapes; an older cached publisher can still bootstrap a thin iframe and supply
attachments, but cannot provide the new page-wide progress relay. Release the
publisher component and embed app together for the complete behavior. Previously
stored anonymous journals are intentionally ignored, not converted or drained.

### Launch performance baseline

The Phase 0 real-vault benchmarks measured different runtimes and must not be
collapsed into one number. On the M1 Max host, the TypeScript/Wasm candidate
loaded and projected all 64 shards in about 0.99 seconds. The Release iOS
Simulator Swift candidate took about 3.44 seconds: 2.73 seconds in native
Automerge materialization and 0.71 seconds in JavaScript decoding/projection.
Incremental reviews remained tens of milliseconds.

The app opens the local root and catalog, then displays only an authoritative
queue. Debug development-client or Metro launch-to-screen time is not a
vault-read benchmark; the hosted-fetch smoke test logs the native open and
queue-projection stages separately in an optimized Release build.

The schema-2 layout removes that full projection from the review launch
path. Earlier measurements, before the shared-store consolidation: on the real
10,867-task corpus, a signed Release benchmark on the iPhone
14 Pro loaded its 0.98 MB fresh catalog in 25.2 ms, scanned it in 81.0 ms,
opened the first task in 0.34 ms, and opened the first 50 in 9.0 ms. In the
complete Release Simulator app, an ordinary relaunch opened the local vault in
309 ms and produced its authoritative queue in another 83 ms. A root-only cold
client opened in 1.38 seconds and produced the queue in another 46 ms. The
catalog—not a SQLite, IndexedDB, or widget index—selects the queue; other task
documents can reconcile in the background.

## Authentication and control plane

The WebSocket router verifies a current, revocation-checked Firebase ID token
before handing a socket to the account's Repo. Native sends the credential in
the upgrade `Authorization` header. Browser WebSockets cannot set that header,
so the browser sends the same credential in a bounded admission frame. Both
carriers converge immediately on the same verifier and account-routing code.
There is no sync-session endpoint, opaque ticket, or ticket store.

The small HTTPS control API remains for operations that are not Repo document
sync:

- resolve the account's one server-owned root, creating and durably storing it
  before the internal sticky-binding transaction only for a fresh new account; and
- read or change reminder preferences in the root (Firebase ID auth), plus
  confirmed snooze/unsubscribe actions from emails (reminder-only signed links); and
- read embedded task projections and accept review/attachment batches into the
  authenticated account's Repo, with durable application before acknowledgement.

Clients never propose a root URL. Concurrent first resolves elect the same
canonical root, and an existing or migrated account is never given an empty
replacement if its binding is missing.

## Single-host reminder service

The notifier runs in the same single-host process as Repo sync. It is explicitly
enrolled for dogfood accounts; legacy accounts retain the existing Firebase
notifier. Clients do not generate or publish notification plans; the former
plan endpoint, Firestore plan index, and Firebase plan worker are removed.
Account reminder authority is `legacy`, `pending` explicit enrollment, or
`server`. Existing email links retain their confirmation/authentication path.

Enrollment is an explicit, one-account operator command, run with the owning
sync service stopped. It copies existing preferences, durably registers the
reminder index, then changes reminder authority. Ordinary startup never performs
that handoff or enumerates an enrollment cohort: it resumes the persisted index.
An unavailable optional mail configuration disables reminders with a diagnostic
without preventing Repo sync from starting. Enrollment itself requires valid
configuration and fails visibly; corrupt reminder storage remains a startup
failure, not a silently disabled notifier. See
`packages/automerge-sync-server/deploy/REMINDERS.md` for the command and the
single-writer operating constraint.

The notifier uses the catalog's existing `nextDueTimestampMillis` projection
and task heads. At the user's notification time it scans the catalog and counts
tasks due now. A nonempty queue starts a reminder sequence: one invitation,
then follow-ups separated by **2, 2, 5, 10, 20, and 30 local calendar days**,
then no further reminders until task activity or an empty queue resets it.
It sends at most once per local day, even after a reset. These are the legacy
follow-up gaps, without the old session batching. If later evidence calls for less noise,
a threshold such as “five tasks due or the oldest task one day overdue” can
still be computed entirely from due timestamps. The notifier must not copy
scheduler-specific interval, stability, difficulty, or review-history fields
into the catalog. A future FSRS scheduler changes how a task's next due time is
derived, not this notification interface.

The root holds `notificationPreferences`: enabled, snooze deadline, local time
in minutes after midnight, and IANA timezone. Initial enrollment copies the
previous unsubscribe/snooze state and retains the old 08:00 Pacific default.
This data is not part of the catalog and does not change on reviews.

SQLite on the same durable volume holds an account-routing index, the next
evaluation time, the last local attempt date, a sequence attempt count, and a
fingerprint of the catalog's task IDs, indexed task heads, due dates, and
deletion flags. Reviews, edits, and new tasks reset the sequence; passage of
time, catalog rollover, and equivalent packed-entry encodings do not. Snooze
and disable preserve the sequence. The daily catalog scan continues after
backoff exhaustion so activity can restart it without another client signal.
There is no new client field or scheduler-specific projection. SQLite holds
no task content or review history. Its one persisted HMAC key signs reminder-only settings links;
GET only displays confirmation, and POST durably changes the root. Existing
email links pass through the original confirmation/login boundary before
changing the same root via the authenticated control endpoint.

Delivery is intentionally best effort: record today's attempt
before calling Mailjet, do not retry an ambiguous result that day, and let the
next scheduled follow-up recover naturally. An ambiguous delivery consumes a
sequence attempt as well as the day. A missed reminder during a crash is
preferable to a duplicate. With one notifier loop on one host, an in-memory
overlap guard is sufficient; there is no worker lease, distributed claim,
transactional outbox, or Mailjet reconciliation service.

This consolidation removes notification-specific Firebase scheduling and
state for enrolled accounts. It does not replace Firebase identity verification
on the Repo router or the one-use login codes in review email links; identity is
a separate boundary. Mailjet credentials are loaded from one deployment secret,
not stored in the vault or SQLite. All vault reads/writes use the sync process's
existing account Repo, protected from eviction during the operation.

Each pooled account/root has one lazily opened domain repository shared by HTTP
and reminders. Its existing operation queue serializes their mutations; HTTP
does not add another write lane or construct a repository per request. Reminder
scans use that repository's catalog-only read rather than opening task histories.
Quota accounting runs in the filesystem adapter's existing disk-mutation queue,
not in a second storage wrapper or queue.

One timer checks the SQLite deadline index each minute. Disabled accounts are
rechecked daily; confirmed settings changes wake their row immediately. An
empty queue waits until the next local day's notification time. Missing newest
catalog generations fall back to the previous available catalog, with the
same explicitly accepted narrow handoff risk as review clients. Snapshot/restore
must include `reminders.sqlite` and its WAL alongside account files: unlike
the next-evaluation index, the attempt dates/counts and settings-link key are not
rebuildable from task documents.

## Deliberately retained adapters

These pieces still have a concrete boundary to serve:

- The native ordinary-file provider implements Repo Swift's storage protocol.
- The server's filesystem provider adds atomic replacement, quota accounting,
  and crash behavior needed by the single-host deployment.
- The bounded server Repo pool protects a multi-account process until upstream
  document eviction and garbage collection are available and proven.
- The legacy review database and typed-mutation-to-event adapter serve only
  accounts whose server migration state is `legacy`.
- The thin embed's legacy HTTP transport preserves compatibility with the old
  tasks/events/attachment endpoints until the remaining accounts migrate.

Each should be removed when its named boundary disappears; none is a second
general-purpose persistence abstraction for migrated vaults.

## Rollout state and gates

Account migration state is intentionally small: `legacy`, `migrating`, or
`automerge`. Only `automerge` accounts can use hosted Repo sync. The feature
flag lets web and iOS attempt the hosted path after the operational checks in
`packages/automerge-sync-server/deploy/PHASE3_GATES.md`; the server's account
state remains the authority, so an unmigrated account falls back to legacy.
Android remains on the legacy path until it has an equivalent native Automerge
runtime.

Existing accounts cross that boundary as a server-side replacement, not a
client transition. The one-account tool briefly changes the account to
`migrating`, transactionally blocks new legacy events, snapshots and audits the
legacy source into an ordinary-file Repo generation, atomically installs it,
then binds that root and changes the account to `automerge`. Clients do not read
a shadow vault or promote local legacy data. The legacy source is retained for
the rollback window, and a private manifest makes post-cutover reviews exactly
extractable before any rollback.

The single-account durable-volume dogfood deployment is live. Before a real
cohort, the remaining work is operational evidence rather than a new
architecture layer: complete the host-loss restore drill, soak reconnect and
concurrent-client behavior, audit logs and proxy settings, and record
measurements on the oldest supported browser and physical iPhone.

Schema 2 was built and audited in parallel before Andy's hosted account binding
changed on 2026-09-28. The former root survives only in the archive. Andy
confirmed normal startup, bidirectional Chonk/Chrome reviews, offline review
and reconnect, and kill/relaunch durability on build 56 on 2026-10-03.
Editing, creation, rollover, and the broader soak remain in the adoption gate
in `design/per-task-vault-v2.md`.

The 64-shard code paths have since been retired, and account migration builds
schema 2 directly. The later thin-embed replacement removes anonymous persistence
entirely; its old journals require no preservation or converter. Before the
schema-2-only deployment on 2026-09-30, Andy confirmed that
no active account binding still named a 64-shard root. He chose to discard access to any old local-only
anonymous 64-shard vaults; no local files or archived server artifacts are
deleted by the code cleanup. `design/per-task-vault-v2.md` records the precise
retirement boundary and remaining field tests.
