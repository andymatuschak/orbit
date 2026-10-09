# Phase 3 gate record

The implementation gates below are backed by automated tests unless their
evidence explicitly says manual. The operational gates require dated evidence
from the actual candidate host. Official cohorts remain **HOLD** until every
operational gate passes.

Current candidate: schema 2, iOS build 56 (accepted by Andy on 2026-10-03),
and server image `sha256:59fae8b319ca297bdd61df3fe50e4a5e102549dfc9a85a4b758d19d07167af0f`
(deployed 2026-10-05). Earlier dated entries are historical evidence, not
fresh validation of this exact candidate. Schema-2 lifecycle acceptance lives
in `design/per-task-vault-v2.md`; reminders and deployment evidence live in
`REMINDERS.md`. The original exploratory proposal has been retired.

## Implementation gates

2026-10-05 local regression refresh: the three server
durability/convergence tests, seven Automerge-store tests, 92 app/plugin tests,
full workspace build, and app typecheck passed. The Release hosted-fetch
Simulator test also passed with 10,867 catalog entries: a root-only client
fetched its narrow working set, a local review survived process termination,
a second Repo client advanced the live queue, and a pre-admission conflict
fetched its remote-only task and repaired without retry or reinstall. This
is local regression evidence, not a new physical-device or cloud-recovery gate.
All nine real-server integration cases passed, including the extended per-task
test's unwarmed catalog handoff and cached-reader restart. The new isolated
hosted browser suite passed anonymous
registration/import with attachments, existing-account preservation, and task
creation/editing/live deletion, but **fails at immediate cold reopen after
catalog rollover**: IndexedDB contains sync state without document bytes, and
the reopened client does not re-fetch the missing catalog. See the dated
results in `design/per-task-vault-v2.md` for the original failure evidence.

2026-10-06 browser crash-gap fix: a minimal backport of upstream Repo's
share-policy correction makes the access-only server respond to an explicitly
requested document even when the client's frame has no heads. The unchanged
hosted browser suite passed twice, including immediate cold rollover/reopen
and a task created only in the new catalog. A deterministic cache-loss test
failed before the patch and now recovers from both warm and restarted cold
servers. All 14 real-server integration cases passed. This closes the local
browser lifecycle gate, not the remaining field or infrastructure gates.
The temporary backport was then removed in favor of unmodified upstream
Repo and adapters `2.6.0-alpha.5`, which includes that correction. All 14
integration cases, five focused durability cases, two complete hosted browser
runs, and the Release Simulator hosted-fetch gate also pass on this release.
See the dated adoption record in `design/per-task-vault-v2.md`.

- [x] Legacy users cannot bind a root or publish a notification plan.
- [x] First root binding is transactional and sticky under a race.
- [x] Firebase ID tokens travel only in authorization headers or the browser's
      bounded first WebSocket frame; credentials are never accepted in URLs.
- [x] Firebase Admin performs revocation-checked verification independently at
      every control request and every WebSocket admission.
- [x] Pre-admission frames, malformed messages, frame size, message rate,
      socket count, account socket count, and socket lifetime are bounded.
- [x] One private Repo and encoded NodeFS prefix isolate each account.
- [x] Loaded-account count, idle eviction, per-account bytes, and process
      recycling thresholds bound server resources; cold quota indexing scans
      file metadata without reading every stored value into memory.
- [x] Fresh anonymous roots promote in place; existing roots receive an
      idempotent semantic import while retaining the source for recovery.
- [x] After access-code authentication, web `/review` opens the same hosted
      account root on a fresh browser, records reviews locally first, resolves
      attachment bytes from that root. Client reminder plans were removed on
      2026-10-01; the server reads the same catalog.
- [x] On iOS, the authenticated review client uses upstream Repo Swift 0.3.2
      over an authorization-header-admitted Repo v1 connection. Its ordinary-file
      StorageProvider persists complete documents, and Repo's global actor plus
      Automerge merge semantics serialize remote changes with local writes.
- [x] The iOS client obtains a current Firebase credential on every reconnect,
      validates the account/root binding, pins server storage identity from Repo
      peer metadata for the local Repo lifetime, and fetches attachment
      documents lazily. The catalog is the review index; the client
      concurrently fetches only the selected 50 tasks.
- [x] Fresh-root promotion, existing-root semantic import, content-addressed
      attachments and locally durable review writes have native implementations.
      Android remains explicitly on
      the legacy facade.
- [x] The exported iOS Hermes bundle contains the native transport but no
      Automerge JavaScript/Wasm implementation. The separately built browser
      SharedWorker still owns its web-only Wasm artifact.
- [x] Node real-server integration accepts a captured Repo Swift 0.3.2 first
      `join` frame without an Orbit protocol shim, rejects malformed or legacy
      admission, safely reuses an unexpired Firebase token, and exchanges later
      Repo changes in both directions with the TypeScript reference adapter.
      The pinned package graph and Orbit native module compile for the iOS
      simulator.
- [x] A 2026-09-12 manual cross-language harness ran actual Repo Swift 0.3.2
      against a cold NodeFS-backed TypeScript Repo 2.6.0-alpha.3 server. It
      reproduced the native first-open failure: `reconnectOnError: false`
      consumed only the first post-handshake sync frame and closed before the
      stored document arrived. Keeping the receive loop enabled while bounding
      Repo Swift's internal retry to one delivered the cold document and left
      fresh-credential reconnect ownership with Orbit. The harness was then
      extended to mutate that fetched document through Repo Swift after the
      connection was ready; the TypeScript Repo received the new value.
- [x] Logout detaches transport without deleting the local hosted vault, and
      reconnect—including during initial bootstrap—obtains a current credential
      from the authenticated iframe.
- [x] Remote Repo changes reproject through the shared owner and materialize
      only the bounded task set needed by the client.
- [x] The original client-plan handoff preserved the legacy policy and cadence.
      Superseded on 2026-10-01 by the single-host reminder implementation:
      root preferences, existing catalog due dates, one attempt per local day,
      and SQLite operational state. No interval/history projection or worker
      lease. Local tests cover daily/DST scheduling, persisted attempts,
      ambiguous delivery, and scanner-safe settings changes.
      On 2026-10-05 conservative follow-up gaps of 2/2/5/10/20/30 local days
      were restored, then stop until task activity or an empty queue resets the
      sequence. Six new unit regressions cover cadence, reset, DST, and upgrade;
      rollover/fallback tests also corrected oldest-first notifier reads. All
      36 server unit tests, 13 integrations, and four reminder integrations in
      the exact published AMD64 image passed. Existing state was preserved on
      deployment. The first real backoff follow-up remains to be observed.
- [x] Activate the new notifier for Andy only, verify copied preferences and
      cleared Firestore plan state, then verify a real scheduled delivery.
      See `REMINDERS.md`: stopped-writer snapshot READY, root unchanged, one
      SQLite row, vault prefs enabled at 08:00 America/Los_Angeles, and
      `reminder_sent` for 1,325 due tasks at 2026-10-01 21:00:55 UTC. Mailjet
      accepted the message; Andy confirmed inbox receipt on 2026-10-01.
- [x] Confirm normal Chonk/Chrome review convergence after the notifier cutover.
      On 2026-10-03 Andy confirmed build-56 startup, bidirectional reviews,
      offline review/reconnect, and kill/relaunch durability. Build 56 fixes a
      pre-admission remote-only repair fetch reproduced in the Release
      Simulator; the original first-opening error was not retained. This is
      focused device acceptance, not proof of the broader operational soak.
- [x] The existing account-creation intro email remains independent of hosted
      account provisioning.
- [x] The Node integration suite restores synced content into an empty
      temporary volume and revalidates structural account isolation.
- [x] The 2026-09-25 focused local durability/convergence gate independently
      edits two offline replicas, restarts the real hosted-sync service on its
      original ordinary-file volume, reconnects both replicas with fresh
      revocation-checked admissions, and verifies identical merged heads and
      values from a third clean replica. The dedicated iOS Simulator smoke then
      drove two reviews through the production UI, killed and relaunched the
      app, and externally verified both observations in Repo Swift's ordinary
      files. This is local regression evidence, not the remaining physical
      web/iOS soak or production recovery drill.
- [x] Storage close drains final Repo writes before a volume is released.
- [x] One-account migration freezes legacy writes transactionally, takes a
      stable watermark, imports into a private generation, fresh-process audits
      logical projections and document heads, and atomically installs before
      binding the account root.
- [x] Migration manifests identify the exact imported review set; the private
      recovery export emits only reviews created after cutover and refuses to
      overwrite an existing output file.

## Operational gates — HOLD

- [x] Resolve the build-19 release-configuration incident without retaining a
      second migration path. Build 19 had neither the hosted-sync flag nor the
      dogfood origin, so its reviews remained durable in legacy SQLite while
      the migrated account correctly rejected their legacy upload. Builds
      20–22 used the explicit `dogfood` profile and an idempotent, cursor-bound
      recovery. On 2026-09-14 the server admitted the client, received 35 new
      Automerge change files (4,157 bytes), and became quiescent after recovery
      completed. Subsequent dogfood reviews have remained durable in the hosted
      vault. The one-time recovery flag, implementation, and tests were removed
      from the cleaned candidate on 2026-09-25.

- [ ] Build and scan the exact current container image intended for the spike.
  - 2026-10-05 reminder-backoff candidate: immutable AMD64 image above passed
    the exact-image reminder suite, database-upgrade check, runtime inspection,
    and public health/readiness. A fresh vulnerability/secret scan has not yet
    been recorded for this image; the older scans below do not close this gate.
  - 2026-09-10 local candidate: ARM64 image
    `sha256:e03a1d19bac6f425e0e05c24862cceec7232efccf18adf7e0cce5ac8795bace8`,
    287,454,851 bytes, unprivileged runtime, 65.31 MiB idle RSS. Trivy
    0.74.0 reported zero fixed high/critical findings. Health/readiness
    returned 200, metrics returned 404 by default, and SIGTERM completed in
    0.09 seconds. Lockfile integrity, lint, build, workspace tests, seven
    server integration tests, and 98 backend emulator tests passed. The
    corrected Anki archive completion barrier also passed 20 consecutive
    package-suite reruns. The dependency lock and Phase 0-3 implementation
    are committed. This candidate was superseded by the deployment below
    after the final deployment-path simplification.
  - 2026-09-11 deployed candidate: ARM64 local image
    `sha256:87bb59c0bac7844fcbd66d275c1e53c1f80c54e8956865394c54395a6448c313`,
    287,453,741 bytes, published as immutable registry manifest
    `sha256:ba3c87904f7b5a1ef6551f280e3c9bdf3657f66a90fbbbccd8f450590a85e53a`.
    Trivy 0.74.0 reported zero fixed high/critical findings and no secrets.
    The exact image returned health/readiness 200, metrics 404, and stopped
    cleanly; deployment-only startup and IAM files are outside the image.
  - 2026-09-30 schema-2-only dogfood candidate: clean TypeScript outputs and
    runtime imports were checked before building. The exact published
    linux/amd64 manifest is
    `sha256:9e8bd494fd048b17b0c09b1d90eb13794e4ed1b2fed0390a307a3800c38fdc7d`.
    Local module loading and health/readiness passed; Trivy 0.74.0 detected
    zero secrets. The current vulnerability database reported four fixed HIGH
    findings: two in Debian `libssl3t64` and two in `brace-expansion` 2.1.4.
    The same four appear in the previously deployed image; the current
    upstream distroless Node 22 Debian 13 base still contains the two OpenSSL
    findings. This is not a security clearance for a wider cohort.
- [x] Deploy the transactional legacy-write gate, dry-run the audited migrator
      against the selected real account, and retain its content-free counts and
      source/logical-vault hashes for comparison with apply. The whole manifest
      hash is expected to differ because each fresh conversion has new document
      identities and audit metadata.
  - 2026-09-11 backend deployment hash:
    `b267044c0a7fb84a7a6ec1a6bd593a3a5d42458d`. Focused production-gate
    emulator coverage passed 15/15.
  - Three dry runs, including the exact deployed image, agreed on account
    fingerprint `8294e70850641da01ae6c6d3`, 105,633 events, 10,867 tasks,
    5,421 active tasks, 77,761 observations, 75,703 reviews, 69 attachments,
    and 134 documents. Source hashes were
    `aacd053df6a8e8a97e38c409b1780a751cddf3234aed2080a4f187deb5bfdb27`
    (watermark),
    `3cea42935a25efb2cf9fe64b84bc33de5da1884a666aba109d6b5b6ab7a78e53`
    (events),
    `b0ebc10d3fe30aca1cde3a70da5d3a13e864a96f4db813d8e04af701fc491d0f`
    (tasks), and
    `a22b84f088c66869494c80a9038528f3d71ed711f7b76344eeffd926bb75e640`
    (attachments); the logical vault hash was
    `825532d994016e2f7112ac84f0be5357a5e8983b4a67a142f9a3c8563afe71ee`.
    Apply reproduced every source/count/logical value and archived manifest
    `51ddf2ca5b7089bba1e3f4e00a79cf3213be92c9f305e3507b2c94fc35dd3a0a`.
- [x] Provision only the selected account's inert legacy control record, first
      as a dry run and then with an exact email confirmation. Verify that it is
      still rejected by hosted sync before migration.
  - 2026-09-10 production read-only census: 3,931 legacy accounts found;
    0 existing hosted control records and 3,931 missing records.
  - 2026-09-11 an abandoned broad apply created 800 inert legacy records before
    stopping at one malformed legacy registration timestamp. It did not write
    a completion sentinel, migrate an account, enable hosted sync, or disable
    legacy writes. The remaining accounts were unchanged. The global pass and
    sentinel have been removed; the candidate now uses an exact single-account
    command.
  - 2026-09-11 the singular command first reported `would-create`, then
    `created`, then `existing` for fingerprint
    `8294e70850641da01ae6c6d3`. After cutover, a content-free census found
    exactly one Automerge account—the selected account—and zero accounts in
    `migrating`.
- [x] Deploy one instance with a real durable POSIX volume and prove there is no
      overlapping writer during deploy or recycle.
  - 2026-09-11 `orbit-automerge-sync-1` runs the immutable image above on a
    dedicated 20 GB balanced persistent disk behind HTTPS/WebSocket load
    balancing. The server was cleanly stopped before generation install;
    its 201-file installed tree matched the audited source file-for-file,
    the recovery exporter reopened it with zero post-cutover reviews, and
    only then did traffic resume. TLS, health/readiness, disabled metrics,
    authentication, origin rejection, malformed WebSocket admission, and
    direct-port isolation all passed. Snapshot
    `orbit-automerge-data-cutover-20260911` reached `READY` before the final
    restart.
  - 2026-09-18 the server moved from ARM `t2a-standard-1` to x86
    `e2-micro` without overlapping writers. A 700 MB container-limit cold
    restart passed first on the old host. The server then shut down cleanly,
    snapshot `orbit-automerge-data-pre-e2-20260918` reached `READY`, and the
    detached data disk moved to `orbit-automerge-sync-e2`. The replacement
    passed local readiness before joining the existing backend group, then
    reached load-balancer `HEALTHY` before the stopped old VM was removed.
    Public health and readiness passed at the unchanged origin. The old VM
    remains stopped and detached as short-term rollback capacity. The
    physical iPhone's TestFlight build 33 then admitted two authenticated
    sockets and wrote Repo incremental/sync-state files. With the account
    loaded, the container used 378.5 MiB of its 700 MiB limit, the host had
    302 MiB available, and Docker reported zero OOM kills or restarts.
  - Through 2026-09-25 the `e2-micro` replacement remained healthy over a
    representative week: 4.3% average CPU, 23.8% hourly peak CPU, 65,726
    load-balancer backend requests, no application error logs in the latest
    24-hour check, and no observed storage-pressure or restart signal.
    Cloud Logging resumed after the 2026-09-23 credential-cache repair. The
    old production and recovery-drill VMs are stopped with their disks
    retained. The estimated run rate is now roughly $34–40/month.
  - On 2026-09-30 the single-writer VM was stopped and snapshot
    `orbit-automerge-data-pre-schema1-retire-20260930` reached `READY` before
    the schema-1 retirement image switch. An accidental ARM64 image returned
    503 on the x86_64 VM; the old immutable digest was restored and public
    health/readiness recovered before a second attempt. The corrected
    linux/amd64 digest above then started with the existing disk, and public
    health/readiness plus fresh `gcplogs-docker-driver` startup logs passed.
    No error-severity container logs appeared in the immediate post-deploy
    check. The failed image was not kept as the VM's configured digest.
- [ ] Restore the candidate volume and account mapping into an isolated empty
      replacement and complete every recovery check in the runbook. Keep the
      working dogfood host intact and outbound mail disabled on the replacement.
      The 2026-10-05 stopped-writer checkpoint is READY; neither that backup nor
      local restore tests constitute a cloud host-loss drill.
- [ ] Soak repeated browser sleep/wake, network loss, process restart, account
      switching, concurrent devices, quota/capacity rejection, and malicious
      frames for multiple days.
- [ ] Verify production proxy and application logs contain no Firebase token,
      document URL, task/attachment content, email, or account subject.
- [ ] Record oldest-supported-browser SharedWorker/fallback, IndexedDB
      persistence, `/review` access-link recovery, memory, and reconnect
      results.
- [ ] On the oldest supported physical iPhone, record first-open catalog/task
      fetch time, steady-state and reconnect memory, offline review durability,
      process-kill recovery, attachment materialization, and queue/widget
      foreground/background behavior.
- [ ] Soak concurrent web and iOS edits against one fresh account through
      network loss, socket reauthentication, app suspension, and server restart;
      verify convergence from a third clean client and confirm every reconnect
      performs a new revocation-checked admission.
- [x] Activate the audited schema-2 root for Andy's dogfood account only.
  - On 2026-09-28 the writer was stopped, a private schema-1 review export was
    written, and stopped-disk snapshot
    `orbit-automerge-data-schema1-exported-20260928` reached `READY` before an
    update-time-preconditioned Firestore patch changed only the root binding
    and binding timestamp. The candidate source contained 10,867 tasks,
    109,944 observations, and all reviews through the final schema-1 snapshot;
    there were zero newer reviews to replay. The existing service restarted
    locally healthy/ready and then passed public readiness.
- [x] Inspect the exact archived iOS candidate to confirm the Hermes bundle has
      no Automerge Wasm payload.
  - 2026-09-11 App Store candidate 1.0.0 (18), built from
    `de3da15657e2cd6a80b375c4955fff77baaa830c`, had IPA SHA-256
    `46412964cfb2691a75ef27db9fcaffdbb4088bf1fec80c6f37024aea8d54b7b9`.
    Its app and widget versions, bundle IDs, distribution entitlements, and
    deep code signature verified. Its Hermes bytecode contains the exact
    dogfood sync origin, its native app binary contains Automerge Repo
    symbols, and the archive contains no Automerge Wasm file or base64
    payload. Xcode retained exactly one verified `automergeFFI` package
    signature.
- [ ] Inspect the current candidate's Application Support layout to
      confirm attachments and incremental changes remain durable ordinary Repo
      documents without a second SQLite document store.
- [ ] Configure dashboards and alerts for RSS, loaded accounts/documents,
      active sockets, rejections, cold-load latency, storage growth, restart
      rate, and notification-plan failures.
- [ ] Enable `EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC` only for the reviewed **web and
      iOS** candidate. The selected migrated account must open its server-bound
      replacement; all still-legacy accounts must continue on the legacy path,
      and Android must remain excluded until it has a native Automerge runtime
      and equivalent durability/reconnect evidence.
  - On 2026-09-30 the schema-2-only web artifact was published with hosted sync
    gated to Andy's Firebase UID; the served main bundle matched the local
    build byte-for-byte. Build 49 was signed and distributed only to Andy for
    Chonk. Andy confirmed physical installation and reviews advancing in both
    Chonk-to-Chrome and Chrome-to-Chonk directions on 2026-09-30. Legacy-user
    regression checks and the other operational soak/measurement gates remain
    unverified, so this gate stays open.
