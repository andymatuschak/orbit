# Orbit Lab validation record

This is the personal fork's evidence ledger, not the public migration's incident
history. Public/cloud releases, old build incidents, experiments, and the
2026-10-12 publisher repair remain preserved on
`codex/automerge-phase-3-native:design/automerge-validation-record.md`.
That service remains unchanged by Lab work. Start with
[the review guide](automerge-review-guide.md) for the current reading path.

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
Physical review/rollover/offline acceptance is not inferred from that confirmation.
Chonk's copied Expo database confirms checkpoint
`5fb0b238-d732-4248-a549-790ce3adfa58` is fully downloaded; its actual launch is
still a separate check.

## Source reduction

The preserved migration branch remains available; Lab removes those retired
responsibilities rather than disabling a second product behind flags. Counting
tracked package TS/TSX/JS/MJS/Swift lines (including comments/blanks), excluding
scripts, Expo plugins, tests, fixtures, stories, and testing helpers, the retained
runtime decreases from 37,375 to 17,284 lines. This is a whole-tree measurement,
not the size of newly added Automerge code. Generated/ignored build artifacts and
private vaults are not part of the count or the commits.

## Gates still open

- Run the actual Home Screen widget Reveal/review flow on the Lab binary.
- Repeat physical-device bidirectional/offline/widget and native checkpoint tests
  on the installed Lab app.
- Finish the physical edit/checkpoint/download/refresh loop on Chonk.
- Retire the old cloud dogfood serving stack after these physical cutover gates,
  as explicitly approved in the plan; preserve recovery data and public Firebase.

No Lab TestFlight/Firebase publication or cloud decommissioning is implied by
this record. The locally signed phone installation above is explicit. Update
the record with concrete receipts as
each gate completes; do not reuse old public-release acceptance as Lab proof.
