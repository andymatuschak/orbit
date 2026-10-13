# Orbit Lab validation record

This is the personal fork's evidence ledger, not the public migration's incident
history. Public/cloud releases, old build incidents, experiments, and the
2026-10-12 publisher repair remain preserved on
`codex/automerge-phase-3-native:design/automerge-validation-record.md`.
Public Firebase remains unchanged; the separate dogfood serving stack was
retired only after the private cutover proofs below. Start with
[the review guide](automerge-review-guide.md) for the current reading path.

## 2026-10-13: restore existing Bear ingestion

Restored the original Markdown interpreter, deterministic prompt hashing, source
types/validator, and reconciliation tests. The ingester now consumes task
definitions and emits shared `VaultMutation`s, rather than reading an
`OrbitStore` and emitting legacy events. Its CLI opens a separate paired Repo
cache and applies through `PerTaskRepository`; it never writes directly into
the running server's storage directory. The browser's existing admission adapter
is shared with the CLI. Originless headless clients still require the pairing
frame before any Repo bytes; supplied browser origins remain allowlisted.

Confirmed:

- Workspace build, lint, 263 unit/operator tests, and 18 integration tests pass.
  Restored interpreter tests retain
  their two matching snapshots and one pre-existing skipped whitespace case.
- All 13 existing server/update integration tests, a new originless-admission
  rejection test, and four new importer tests
  pass. The importer test starts an actual private server, previews without task
  mutations, imports a new document and provenance update while an independent
  client reviews, observes the new task on that peer, and cold-repeats with zero
  mutations. After quiescing the server, its own persisted files contain both
  tasks and both original/concurrent review observations.
- A remote provenance change between cold runs is reconciled, including through
  the actual Bun CLI used by the notes wrapper. A 131-task fixture spans three
  released inventory batches and cold-reopens successfully. An admitted server
  that never supplies a document times out, exits nonzero, closes its socket,
  and releases the importer lock.
- Invalid input and authentication failures exit nonzero without printing the
  pairing token. The obsolete `.catch(console.error)` false-success behavior is
  not retained.
- Source-scoped matching keeps identical prompts in separate notes distinct.
  An unambiguous move retains its original task ID and observations; content
  edits and re-adds retain the historical delete/create policy.

The first real-data preview encountered ENOSPC before applying ingestion
mutations. After Andy restarted the Mac, available space recovered to about
68 GiB. Inventory reads now flush and release Repo handles/listeners in batches
of 64; they retain decoded task definitions, not every live task history.

The real interpreter read 4,880 sources and 3,574 prompts. Import applied 21 new
tasks and one provenance-title update, with no deletions. The other three items
from the earlier pending-event comparison belong to notes now in Bear's Trash;
the coordinating sync task verified this read-only. A cold repeat produced zero
mutations. Before/after comparisons preserve all 10,867 original task definitions
(apart from the intended title), all 109,972 observations, and all attachment
descriptors. The observation SHA-256 is unchanged:
`722e8fa38e6ca0ff067b8c02191899eb0671475310816ed1f3cf52e9f4a93fde`.

A quiesced server snapshot and independent portable export at
`~/Library/Application Support/Orbit Lab/recovery/bear-ingest-20261013` contain
10,888 tasks, 109,972 observations, 105,856 reviews, and all 69 byte-verified
attachments (9,173,933 bytes). Its logical vault matches the client capture
exactly; semantic SHA-256:
`37682134c0915c423ad0b93148edbed4a1759afd2946a155773cd0505716edf9`.

Only the Orbit checkout/ingestion stage in `/Users/andym/bin/syncNotes.sh` changed.
It now interprets notes from this branch and calls `lab:ingest`, retaining nonzero
failure status and removing the obsolete legacy upload command. Its other bytes
are unchanged. Both Orbit commands were tested separately under the wrapper's
scheduled PATH (without relying on interactive Node/fnm). The complete wrapper
was not run: its Bear/reMarkable and website-publishing stages are outside this
cutover. No public upload or legacy event-store/cursor changes occurred. Lab's
loopback and private Tailscale readiness checks pass after restart.

The quiesced check also exposed a development-loop shutdown issue: Bash deferred
its signal trap while Metro ran as a foreground external command. `lab:dev` now
tracks Metro and uses builtin `wait`, letting TERM/INT enter cleanup immediately
and wait for the writer's normal flush. A fresh real loop released its writer
lock naturally after TERM (about 0.9 seconds); it was restarted and readiness
checked again. No live lock was deleted or second writer allowed.

## 2026-10-13: source and platform boundaries

Implemented the independent paired client and single-user server. Client
runtime no longer imports Firebase, legacy stores/sync, embeds, reminder
settings, analytics, or public API fallback. The saved selection uses a fresh
Lab namespace and is the only startup source. Native sync uses the paired
Bearer header; browser admission precedes Repo bytes. Shortcuts ingestion and
the SQL image loader were removed; the widget uses `OrbitAppGroup` and its
existing shared JSON helper.

Confirmed checks:

- App typecheck and app/plugin lint passed.
- 82 app/plugin tests passed, including review reconciliation, admission,
  native local-first opening, widget import/acknowledgement, and math layout.
- The browser Repo test cold-opens cached prompts without a reachable peer,
  durably records an offline review, shuts down, reopens, and reads its exact
  observation. A catalog with no local prompts reports unavailable data rather
  than a false empty queue.
- Scene lifecycle tests passed. Changed Swift sources parse and the widget
  Info.plist validates.
- The real Swift JSON writer and three-process handoff suite passed: publication/
  review races, eight interrupted writes, acceptance/import crash replay,
  selective acknowledgement, and malformed-journal preservation. Foundation
  temporary-file writes required a narrow sandbox exception; no app/vault data
  was touched by those tests.

Native acceptance below extends these component proofs. Home Screen interaction
and Chonk installation remain separate gates.

## Data boundary

The original service was captured read-only and independently validated:
10,867 tasks, 109,970 observations, and 69 attachments (about 9.17 MB of attachment
bytes). A read-only Chonk capture contained 76 task documents and 1,772
observations; its captured review tail was already included in the server corpus.
The independent seed preserves those counts, recent review IDs, scheduling,
definitions, and verified attachment bytes, while creating new vault and document
identities. Its semantic SHA-256 matches the capture:
`0a95a383d5d15948660d834802f26888bf4c57389e52937ff9f3bf6c546f5f16`.
A quiesced snapshot restored into a new temporary directory and exported with
that same digest. The protected data/configuration/recovery directory is
`~/Library/Application Support/Orbit Lab`; no live bridge exists. The old phone
Repo, selection record, and complete reachable App Group were captured without
clearing them. CoreDevice exports only the App Group's Library/Documents/tmp
directories: its restriction prevents independently reading the root-level
handoff JSON, so absence from that capture does not establish an empty outbox.
The handoff file was not deleted; the shared writer preserves pending entries
when publishing the new vault's queue.

## Local end-to-end proofs

- The retained build, app typecheck, lint, 177 unit/operator tests, and 13 server/
  update integration tests pass. Test servers use disposable loopback data.
- The browser smoke passed twice in fresh real Chrome contexts: ordinary pairing,
  Reveal/Remembered, backend shutdown, cold page reopen and offline review,
  restart/reconnect, and exact observation delivery. Public HTTP/WebSocket calls
  were blocked and none were attempted.
  The final pass also observes browser-level script/image/font traffic, not only
  fetch/WebSocket calls. It passed after removing the obsolete public Sentry HTML
  template.
- The Release Simulator binary cold-launches its embedded bundle with Metro and
  the backend absent. Two UI-driven reviews survive restart in ordinary files.
- Expo downloaded checkpoint A and cold-launched it with the backend stopped.
  Checkpoint B's visible JavaScript menu change appeared through explicit reload,
  without reinstalling the app. Native cache IDs and successful-launch counters
  confirm which bundle ran; there is no custom bundle loader.
- Candidate C's native 20 MiB asset transfer was interrupted after 10,878,976
  bytes. Expo kept C unlaunchable and cold-launched completed B offline. An
  incompatible runtime received no-update and downloaded zero assets.
- Clean checkpoints use private Tailscale HTTPS assets and have successfully
  launched in the Simulator. Actual iOS export/publication measured roughly
  10–24 seconds. Updates are never automatically applied mid-session.
- In a separate three-task fixture, the actual Repo Swift bridge syncs an ordinary
  UI review to an independent JavaScript Repo; a JavaScript review advances the
  already-open native queue. A cached PNG task remains reviewable offline. Its
  third review and verified PNG bytes survive process death; reconnect delivers
  all three exact observation IDs once to a fresh JavaScript peer.
- The checked-in `run_ios_review_smoke.sh` repeated that full three-task gate
  successfully using AXe controls and disposable ordinary Repo files. It also
  checked visible image pixels, verified the native bytes independently, and
  restored the previous Simulator selection. No personal reviews were created.
- `lab:dev` ran against the private corpus. Two source edits triggered sequential
  compiler/watch restarts; each new backend acquired the released writer lock.
  Graceful stop removed the lock, and restarting kept the same Repo storage
  identity. The normal private route was restored after the disposable test.
- Private Tailscale Serve is configured at `https://slab.tail0da701.ts.net` for
  sync/updates and port 8443 for Metro/web. Chonk is confirmed online on Andy's
  personal tailnet. Public Funnel is not enabled.

These prove native offline code/data and convergence in the Simulator, not
physical Home Screen WidgetKit acceptance. The locally signed iPhone shell has
the existing team, bundle ID, App Group, private update URL, matching runtime,
and a profile permitting Chonk. It was installed over build 56 without an
uninstall, after priming a new store with 50 due tasks and all 69 attachments
(121 verified ordinary-file snapshots, about 10.06 MB). The old selection
records/files remain; Andy confirmed the app and existing widget display prompts.
Physical acceptance is not inferred from that display confirmation alone.
Chonk's copied Expo database confirms checkpoint
`5fb0b238-d732-4248-a549-790ce3adfa58` cold-launched successfully (three launches,
zero failures). A temporary private read-only JS audit, using the existing native
widget reader, then ran as checkpoint `db7a7afb-4a21-45c3-afdc-21d0e97881d7`.
It confirmed zero pending entries for both the old public vault and the Lab vault.
No original handoff data was changed; the audit was removed from source and
replaced by a clean checkpoint.

With the private sync/update route disconnected, Andy completed one app review
and one widget Reveal/review and confirmed both advanced. Independent decoding
of Chonk's captured ordinary files confirms two new observations on distinct
tasks, with distinct stable IDs and the expected app/`WIDGET` session origins.
The app was then stopped; the bytes remain present. Initial locked-device
relaunch attempts were denied. After opening with a working private connection,
the root and catalog heads matched the server, but neither authoritative task
history had arrived. The two reviewed tasks ranked 4,840 and 1,383, outside the
first-50 opening set. Repo registers loaded handles, not every file in its
storage: cold startup reopened only the current queue and stranded those saved
histories. This is a confirmed document-interest bug, not a network hypothesis.

The earlier three-task Simulator proof did not cover that boundary. The revised
fixture seeds 53 due tasks and moves the three reviewed tasks to ranks 50–52.
Its native verification reads ordinary cached bytes without registering the
reviewed documents; a separate fresh JS peer must see their observations after
cold relaunch. Native and browser startup now share a yielded background pass
that enrolls only locally cached task documents, independent of the display
queue.

### Cached-history sync fix: confirmed

- Build, lint, app typecheck, all 194 unit/operator tests, and all 13 server/
  update integration tests pass. The real-browser offline/reconnect smoke passed
  again without public HTTP/socket calls. The 53-task Repo-to-Repo regression
  fails with enrollment disabled and passes with the fix.
- The actual Release Simulator ran private checkpoint
  `a68ac8b1-9fe8-4ed2-9243-3ad6c60e2c7e` without reinstalling. The updated 53-task
  UI gate passed: native review to fresh JS peer, JS review advancing native UI,
  visible offline PNG, local review survival through process death, and delivery
  of all three exact IDs after cold reconnect. Reviewed catalog ranks were
  50, 52, and 51, outside the first-50 window. The fixture runs on port 8788 and
  leaves the normal private service on 8787 untouched.
- Andy activated that same checkpoint on Chonk using the existing update menu.
  Its copied Expo metadata confirms one successful launch and zero failures.
  A fresh independent JS peer then read both previously missing observations
  from the private server and compared their complete contents, not just the
  derived catalog. IDs are `review/cepvEg7zSM-JfVIdmih-_g` (app) and
  `review/I5_pcmHmTImGOWDwsdQ2AA` (widget), on distinct tasks.
- A separate native ready/disconnected-before-promise-completion race was also
  reproduced and fixed: connection completion no longer overwrites a later
  disconnect, and retry resumes after the in-flight operation clears.

Only locally cached task histories are enrolled. Repo Swift does not evict their
handles, so memory and reconnect work grow with the downloaded corpus; batching
is not an eviction policy. No new durable journal, index, native API, or binary
was introduced by this fix.

## Source reduction

The preserved migration branch remains available; Lab removes those retired
responsibilities rather than disabling a second product behind flags. Counting
tracked package TS/TSX/JS/MJS/Swift lines at the initial Lab split (including
comments/blanks), excluding scripts, Expo plugins, tests, fixtures, stories, and
testing helpers, the retained
runtime decreases from 37,375 to 17,284 lines. This is a whole-tree measurement,
not the size of newly added Automerge code. Generated/ignored build artifacts and
private vaults are not part of the count or the commits.

## Gates still open

- Broaden physical-device checks to image prompts, widget deep-links, and visible
  browser-to-Chonk advancement. The actual native/JS Simulator gate covers both
  sync directions; it does not substitute for these additional physical UI checks.

The old cloud stack has been inventoried read-only. Operator access works and
public Cloud Functions do not use its dedicated network/service account. Its
exact running image was streamed into the protected local recovery directory:
97,260,782 compressed bytes, SHA-256
`1223244193cf766ddbb7892e51965fef9447d4b1c91801eff30b88528db9d8bd`.
The image configuration and all 35 layer hashes match; no local Docker image was
loaded.

## Cloud retirement: completed 2026-10-13

After Chonk's exact app/widget review delivery and checkpoint launch were
verified, the cloud container stopped gracefully (exit 0, no OOM). A late Guest
Agent metadata-watcher cancellation came from VM shutdown, not an application
flush failure; detailed application flush logs were unavailable. The quiesced
final source export is semantically identical to the initial capture: no tasks
or observations were added, removed, or changed, and all 69 attachments validate.

Recovery files are protected under `~/Library/Application Support/Orbit Lab/recovery`:

- `orbit-dogfood-final-20261013-b2953763-9fee-4c68-b0f3-2e4722a09919.tar.gz`:
  46,505,473 bytes, SHA-256
  `c6f13ae50b60eae8b545ea592cddc784e47947b1480ae18c4fee6414400637d1`.
- The same basename's `.vault.json`: 43,924,815 bytes, SHA-256
  `10981a4b688b4b7fbfb37717aeb50494d1e76e7e0e697adf2716226ae0da0167`.
  Adjacent phase-A and shutdown-audit receipts record preservation and stop checks.
- `sync-image-59fae8b319ca-20261013-48f02fb2-b1da-4a87-8eae-1e6a08e90aa1.tar.gz`:
  the verified historical runtime image above, with its own receipt.
- `lab-cutover-20261013-cached-sync/`: a separate quiesced snapshot and portable
  export of the new private vault. It has 109,972 observations / 105,856 reviews.
  Full comparison confirms every original task, observation, and attachment byte
  is preserved; the only additions are the two real app/widget review IDs above.
  Its semantic SHA-256 is
  `b6ac50dd78b5a43eeb38b5bb5abb08fb8a25d8b0d22a9ef109de7498eec78c7b`.

The final cloud snapshot `orbit-automerge-data-lab-cutover-20261013` was READY
and checked against source disk ID `7531365632051874416` before any disk deletion.
The approved cleanup then removed all three stopped dogfood VMs, all seven disks
(110 GiB provisioned), the dedicated forwarding rule/reserved IP/proxy/URL map/
backend/certificate/health check/instance group, the image registry, the two
dedicated firewall rules, subnet, and VPC. The nine older active snapshots were
deleted; the final snapshot remains. Its stored size after that chain cleanup is
74,809,408 bytes, not the former 20 GiB disk allocation.

Fresh inventories show no VM, disk, forwarding rule, or reserved address remains
in this project. Only `gcf-artifacts` remains in its Artifact Registry location,
and the default VPC was preserved. All 26 public Cloud Functions remain ACTIVE.
No Firebase/Firestore/Hosting deployment, public publisher/iframe, project IAM,
or other user's data was changed. The dedicated monitoring job is confirmed
PAUSED through Codex's existing automation manager; its prompt/cadence were kept.

The remaining dogfood run rate is snapshot storage only: roughly $0.004/month
gross at the observed size and current regional standard-snapshot rate, before
credits or temporary provider recycle-bin retention. This is an estimate, not a
billing statement. [Google's snapshot pricing](https://cloud.google.com/compute/disks-image-pricing#disk_snapshot_pricing)
explains compressed-byte billing and temporary retention. Nonbillable dedicated
service accounts/IAM bindings were deliberately left unchanged.

For data recovery, `bun run lab:seed --vault-json <protected .vault.json> --destination
<new private repo>` validates the portable export and creates isolated document
identities; it does not restore the old public service. The current Lab snapshot
can instead be restored into a new directory with `bun run lab:restore`. Restoring the
historical service would additionally require its preserved image, configuration,
credentials and newly provisioned network/TLS; the released old IP is not a
rollback guarantee.

The normal `lab:dev` loop and private Tailscale route were restored after local
backup, readiness passed, and a fresh JS peer again verified the two reviews.
No Lab TestFlight/Firebase publication occurred. Additional physical UI checks
above remain follow-ups, not claimed results.
