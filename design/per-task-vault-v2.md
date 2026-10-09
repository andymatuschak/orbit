# Per-task Automerge vault

Status: active for Andy's single dogfood account. New hosted vaults use this
layout; anonymous embeds use publisher seeds and page-memory reviews, not
an Automerge vault. Unmigrated accounts remain on the
legacy Orbit store until the server-side account migration replaces it with
this layout; there is no longer a schema-1 Automerge creation or opening path.

## Why this exists

The 64-shard schema made incremental writes inexpensive, but a trustworthy
review queue still required projecting every shard. On the current dogfood
vault that made native launch depend on seconds of unrelated document work.
The widget queue can hide part of that cost, but it is a stale display
projection and should not become the application's general index.

Schema 2 instead makes the synchronized Automerge catalog the review index:

```text
account binding -> generation root -> current catalog -> selected task docs
                                             |
                                             +-> all other task-doc URLs
```

- The root contains vault metadata and immutable catalog-generation
  descriptors.
- The catalog contains one packed derived entry per task: document URL,
  earliest due component, deletion state, and the task heads it reflects.
- Each task document is authoritative for that task definition and all of its
  scheduling observations.
- Attachments remain content-addressed documents referenced from root metadata.

There is no SQLite or IndexedDB review index. IndexedDB stores web Repo bytes
only; iOS Repo uses ordinary files. WidgetKit's queue
and pending reviews share one coordinated JSON file, not a vault database.

## Write and repair rule

Every task mutation follows one ordering rule:

1. Save the authoritative task document.
2. Derive its catalog entry from the resulting task heads.
3. Save the catalog projection.

A crash after step 1 leaves a stale catalog entry, never a falsely committed
task. Selected task reads repair stale recorded heads; `repairCatalog()` is an
explicit full audit. Concurrent task histories merge normally; a repair made
from the merged task resolves any derived catalog conflict. Native open and
refresh repair conflicting entries from locally available task documents;
missing task documents are fetched for background repair rather than blocking
an otherwise usable offline vault. Web scans catalog conflicts in the
background, loads only affected task documents, and repairs them without
delaying the review queue. When two entries name different task-document URLs,
the repair uses Automerge's
deterministic visible catalog value as the URL tie-breaker, validates that the
selected document belongs to the task, and reprojects from that document.
This is not wall-clock last-write-wins; the unselected document may be orphaned.

On iOS, a remote-only repair waits for authenticated Repo peer admission before
calling `find`. Local documents do not wait for admission. Connection priming
opens only documents already available locally; Repo Swift's `documentIds()`
also includes pending requests, so it is not a local-availability check. The
bridge checks resolved, observed handles or ordinary files instead.

The schema-2 projection, queue ranking, task-head comparison, and repair
policy live in `@withorbit/store-shared/perTaskRepository`. The web Automerge and
native Repo Swift document adapters supply loading and persistence, but do not
independently decide the replacement entry. Swift only exposes generic
document materialization and conflict metadata; it does not implement Orbit
schema policy. This keeps one reviewable decision path while retaining the
different storage and synchronization runtimes.

Creating a brand-new task has the narrow handoff risk accepted in the
[rollover design](catalog-rollover.md): if its task document becomes durable but every catalog referencing
it is lost and the creating client disappears, another client cannot discover
that orphan. We accept that risk for this experiment rather than maintain a
second monotonically growing task registry.

## Bounded catalog history

`rolloverCatalog()` rebuilds a fresh catalog from the authoritative task
documents, saves it, and only then announces its immutable descriptor in the
root. Readers choose the newest announced catalog that is locally available
and immediately fall back when a newer one is missing. Replacement is an
explicit maintenance operation built from that fallback, not an automatic
client reconstruction loop. It reads every named authoritative task first;
an incomplete local client cannot safely publish a replacement.

Old generations are not deleted by clients. A conservative hosted-service GC
window remains a later operational boundary.

## Current evidence

The [retained benchmark results](benchmarks/catalog-index-results.md) explain
the catalog, packing, and rollover choices. The duplicate prototype code has
been retired; the actual store tests now cover its crash, concurrency,
lineage, offline-repair, incomplete-reconstruction, and orphan-risk cases.

- Real corpus: 10,867 tasks and 77,774 scheduling observations.
- Logical task documents: 11.55 MB; fresh catalog: 0.98 MB.
- iPhone 14 Pro Release median: 25.2 ms catalog load, 81.0 ms full scan,
  0.34 ms first task, 9.0 ms first 50, 28.0 MiB RSS growth.
- The 2026-09-28 cutover asserted exact logical parity with the former
  64-shard root; the stopped-disk snapshot and private review export remain.
- Tests inject a failure between task and catalog persistence and prove repair.
- Independent offline reviews converge before catalog repair.
- Two authenticated Repo clients pass the same disconnect/reconnect case
  through the real hosted WebSocket router.
- Missing-generation fallback and successor replacement are covered.
- The native facade decodes Repo Swift materializations without loading the
  JavaScript/Wasm Automerge runtime. It opens only the catalog and the selected
  task documents, writes reviews task-first, repairs stale task heads when a
  task is opened, and adopts a newer locally available catalog generation.
- The accessibility-driven iOS Simulator smoke test seeds schema-2 ordinary
  files (not UI fixture branches), starts a client containing only the root,
  fetches the production-sized catalog and first 50 tasks through the real
  authenticated router, records a review, restarts the process, and externally
  verifies the durable observation. On the optimized Release Simulator run of
  2026-09-28, the root-only vault opened in 1.38 seconds and projected its queue
  in another 46 ms. Its warm authoritative-only relaunch opened the local vault
  in 309 ms and projected the queue in another 83 ms.
- On 2026-10-01, build-55 Chonk logs showed a peerless fetch followed by a
  40-poll (~20-second) resolver timeout and repeated unavailable-handle errors.
  The earlier error responsible for the original red opening screen was not
  retained. A Release Simulator regression reproduced the peerless fetch by
  seeding a local catalog conflict whose repair task existed only on the test
  server: repair failed its 30-second gate before the admission-order fix and
  passed afterward, without retries or reinstalling the app. The hosted-fetch
  smoke now includes this case alongside cold fetch and warm convergence;
  the fix was distributed as signed build 56 through Firebase App Distribution
  to Andy only. On 2026-10-03 Andy confirmed normal opening, bidirectional
  Chonk/Chrome reviews, offline review/reconnect, and kill/relaunch durability.
  This closes that focused physical-device acceptance, not the broader soak.

## Repeatable task-lifecycle acceptance

`bun --cwd packages/app smoke:web:hosted` drives the real web component,
embedded review UI, login popup, and `/review` in isolated Chrome sessions.
The fixtures are ordinary vault writes and unique emulator accounts, not
branches in application UI. The backend's real account-creation trigger
provisions those accounts; the real hosted service verifies their Firebase
emulator tokens. Its Repo files live in an owned temporary directory, and no
notifier or mail client is constructed.

The scenarios cover:

1. Two anonymous review areas with publisher-relayed forgotten peer retries;
   reload forgets that page's progress. No worker or anonymous database is created.
2. Anonymous review, registration, and submission of current-page progress,
   including an embedded PNG attachment. Signed-in offline failure stays visible;
   retry after reconnect stores exactly one review.
3. Anonymous review and sign-in to an existing hosted vault. Its root, existing
   task, metadata, and scheduling observation must survive submission.
   Reload must preserve exactly one submitted review. A separate client then
   creates, edits, and deletes/replaces the visible task; the real review page
   must display the resulting content and advance on deletion without
   reloading. Finally it rolls over the catalog, reopens the browser cold,
   and creates a replacement present only in the new generation.

A fresh independent Node Repo client checks the imported task definition,
observation identity/count, unchanged existing root, and exact attachment bytes
through the sync router. Lifecycle mutations wait for remote heads before
disconnecting; a resolved local `apply()` alone is not delivery evidence.
Editing is exercised through the production store API and checked after a
page reload: this does not claim coverage of a browser authoring UI. Rollover
is checked by creating the replacement only in the new catalog, so merely
continuing to display an old catalog cannot pass the final assertion.

Run after `bun run build`, with the Firebase emulators started from
`packages/backend` using
`ORBIT_AUTOMERGE_NEW_ACCOUNTS=true ../../node_modules/.bin/firebase emulators:start --project metabook-system --import emulator-data`.
The test requires free ports 8787 and 19006 and stops only its own services.
It leaves its unique accounts in the disposable emulator session, never in
production. Run the Release `ios:hosted-fetch-smoke` separately: it uses the
same sync port and covers real Repo Swift cold fetch, persisted local review,
warm live convergence, and pre-admission remote-only catalog repair with AXe.
That native harness uses a fixture identity verifier; Firebase verification
and the login UI are covered by the hosted browser suite, not by that harness.

These local acceptance tests complement the multi-day dogfood checks; they do
not admit a broader cohort or establish every native task-lifecycle UI path.

### 2026-10-05 results and remaining cold-reopen failure

Both anonymous scenarios passed, including a reviewed attachment's exact
bytes after registration. Existing-account import preserved the root,
pre-existing active task, metadata, and scheduling observation; reload did
not duplicate the imported review. Browser task creation, edited content on
reload, and live advancement after external deletion also passed.

The complete hosted browser command **fails at cold reopen after rollover**.
The stronger fixture keeps an active, future-due task in the existing account;
deleting that task or opening an independent reader before the browser reload
can hide the failure and is not an acceptable passing gate.

Wire and IndexedDB metadata narrow the failure down: the browser receives and
acknowledges the new catalog, but immediate reload can leave only its 34-byte
`sync-state` record, with no snapshot or incremental document data. Reopening
sends a 42-byte `sync` message with zero heads, needs, or changes, instead of
a fresh document request. The authenticated connection stays open, but the
access-only server does not send the missing catalog, and `/review` remains
on a spinner. The pinned Repo's independently persisted sync state and
document bytes therefore need a focused crash-gap/re-fetch investigation.
This is a reproducible regression, not evidence that rollover is accepted.
No protocol shim, storage wrapper, UI test branch, or production change was
introduced to make this check pass.

The separate ordinary-file server integration passed an unwarmed catalog
handoff followed by a cached-reader restart, with both offline reviews
preserved. The Release Simulator hosted-fetch test passed with 10,867 tasks,
including kill/relaunch persistence, live second-client review convergence,
and remote-only conflict repair. These do not reproduce the browser's
sync-state-only IndexedDB crash gap.

### 2026-10-06 cold-reopen fix

The complete hosted browser suite passed twice, without weakening the immediate
reload assertion or warming the new catalog with another reader first. After
reopen it also follows a task created only in the new catalog generation.

The crash gap is expected to be recoverable: Repo's sync state is a cache,
not durable proof of the client's document contents. The defect was the
pinned Repo's access-only outbound gate. Receiving an empty-headed `sync`
sets `hasRequested` but leaves the peer's document status `unknown`; that
gate checked only the status and suppressed the response indefinitely.
Honoring `hasRequested` lets the ordinary Automerge handshake recover the
document, without changing storage, admission, or proactive sharing.

A minimal backport of the corresponding upstream share-policy correction
initially demonstrated the fix, then was removed in favor of the published
release below. A deterministic real-server regression retains acknowledged
sync state while removing only the temporary client's document chunks;
it failed before the patch and
passes afterward, including recovery after a server restart. The historical
2026-10-05 failure above remains useful evidence of why this gate exists.

### 2026-10-06 upstream release adoption

Repo and its WebSocket/IndexedDB adapters are pinned consistently to the
unmodified published `2.6.0-alpha.5` release across the app, store, and server.
This release includes the
[share-policy correction](https://github.com/automerge/automerge-repo/commit/b54e7a3f1da78769e4caa3f3f0d57a8840fcd983).
It is published under npm's `next` tag; checking only `latest` previously
missed it. The temporary patch files, Bun patch registration, and Docker
patch-copy step are removed. The crash-gap regression and full browser
lifecycle assertions remain unchanged. Repo Swift and the Automerge engine
are not upgraded by this dependency change.

On unmodified upstream, both complete hosted browser runs, all 14 server
integration cases, five focused durability cases, and 135 app/store/server
unit tests passed. The Release Simulator hosted-fetch gate also passed with
10,867 catalog entries: 53 persisted working-set documents, a review surviving
kill/relaunch, live second-client convergence, and remote-only conflict repair.
The forced workspace build, app typecheck, frozen offline install, and Docker
production dependency stage passed. This is local upgrade evidence, not a
deployment or new physical-device performance measurement.

## Adoption gates

1. **Passed:** generate a parallel schema-2 root from the current dogfood root
   and retain a private, content-addressed migration manifest.
2. **Passed:** audit task, observation, attachment, and logical projection
   parity before any binding change.
3. **Passed:** add schema-2 readers/writers to the web bootstrap and the native
   Repo Swift document facade behind an internal root-schema switch.
4. **Partly passed:** Release Simulator cold/warm launch measurements and the
   physical-device launch check passed. Andy installed build 49 and confirmed
   on 2026-09-30 that reviews advanced in both Chonk-to-Chrome and
   Chrome-to-Chonk directions with the deployed web client. Quantified browser
   and physical-device startup measurements remain to be recorded.
5. **In progress:** soak repeated two-client reconnect, offline review, task
   editing, task creation, and catalog rollover against the dogfood server.
   Andy confirmed the focused build-56 review/reconnect and kill/relaunch checks
   on 2026-10-03. Task editing/creation, rollover, and embedded sign-in remain
   distinct field checks.
   Thin embeds submit current-page progress through the account's authenticated
   HTTP transport. They do not own or import an anonymous Automerge vault.
   Field verification is still required before widening the cohort.
   The isolated hosted browser suite above passed creation, editing,
   deletion, and anonymous import without touching Andy's account. Its cold
   rollover/reopen and new-generation-only task gates passed on 2026-10-06
   with the upstream fix above. These local tests do not replace
   the remaining field checks or authorize a broader cohort.
6. **Passed 2026-09-28:** atomically point Andy's dogfood account at the
   audited parallel root. The stopped-writer schema-1 snapshot and private
   review export remain available for rollback.

## Retirement of the 64-shard format

The former 64-shard reader, writer, native decoder, anonymous creation path,
and one-off candidate builder/installer have been removed. A hosted root bound
to that old format will now fail closed rather than silently open with a
different interpretation. Before the 2026-09-30 deployment, Andy confirmed
there were no active hosted accounts still bound to a 64-shard root. He also
chose to discard access to old local-only anonymous 64-shard vaults; there is no
special detection or reset path for them. Their old local files are not deleted
by this change. The stopped-disk dogfood snapshot, migration manifest, and
private review export are retained as historical recovery evidence, not as a
live fallback path. A recovery from those artifacts would use the prior Git
revision.

`OrbitVault` is now a versionless in-memory input. Attachment-document version 1,
scheduler-policy version 1, hosted account-control record version 1, and migration
manifest version 1 are independent current formats, not earlier vault layouts.
Migration audit hashing retains its original hash preimage so existing manifests
remain verifiable; it does not decode or open an old Automerge format.
