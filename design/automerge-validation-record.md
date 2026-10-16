# Orbit Lab validation record

This is the personal fork's evidence ledger, not the public migration's incident
history. Public/cloud releases, old build incidents, experiments, and the
2026-10-12 publisher repair remain preserved on
`codex/automerge-phase-3-native:design/automerge-validation-record.md`.
Public Firebase remains unchanged; the separate dogfood serving stack was
retired only after the private cutover proofs below. Start with
[the review guide](automerge-review-guide.md) for the current reading path.

## 2026-10-16: remove unused native platform support

Removed the Catalyst plugin, its Mac-only entitlements, and the iOS/Catalyst
hardware-keyboard module. Browser Space/1/2 shortcuts remain. Removed the widget's
`ORBIT_WIDGET_EXTENSION` compilation flag: no source used it in a `#if` condition.
The Swift widget renderer and shared handoff are unchanged.

Fresh prebuild confirms the removed settings/module are absent and the widget
App Group remains. Workspace checks pass (**386 unit**, **26 integration**, one
existing skip). The browser smoke now exercises actual Space/2 and offline
Space/1 reviews through reconnect, verifying both outcomes. The harness explicitly
foregrounds its tab; raw CDP keys do not activate it like a click, and a hidden
tab suspends layout callbacks. No app layout code or timeout was changed.

Signed Release Simulator **15**, runtime **5**, passes the 53-task bidirectional
sync, visible offline PNG/review, cold relaunch, and out-of-window upload gate.
This is a native candidate only: nothing was published or installed on Chonk,
which remains on build **14**. The previous generated project is recoverable at
`/private/tmp/orbit-native-cleanup-generated.LxDxzX/ios`.

## 2026-10-16: native merge panic after applying the checkpoint

Chonk crashed after activating the maintained checkpoint. Its matching build-13
crash report and a console-attached cold launch identify the original failure:
Rust Automerge **0.7.2** panics in `op_set2/change/batch.rs:817` with
`PatchLogMismatch`. That poisons the document lock; the next
`generateSyncMessage` hits `PoisonError`, and UniFFI's generated Swift `try!`
terminates the app. This is not a JavaScript rendering exception, timeout,
WebSocket size limit, or memory-pressure termination.

The cause matches [upstream issue 1390](https://github.com/automerge/automerge/issues/1390)
and [its merged fix](https://github.com/automerge/automerge/pull/1400): a new actor
makes a same-value/no-op write, leaving the patch log's actor bookkeeping
inconsistent; an incoming merge then exposes the mismatch. The native Swift
release still links the old Rust binary even though JavaScript uses a newer
engine. No-op writes are legitimate, so the fix belongs in Automerge, not an
Orbit-specific retry, data rewrite, or alternate merge policy.

Copied Chonk's selected **161-document**, 10.4 MB Repo read-only into a separate
diagnostic folder. All documents load and ordinary native synchronization passes.
Adding the no-op write before the copied server's JavaScript sync exchange
reproduces the exact panic in **7/8** root/catalog cases (actor-order-dependent).
The **same eight cases all pass** with Rust **0.12.0** and unchanged Swift 0.7.2
bindings. A synthetic fixed-actor document also reproduces the old panic and
converges with the new engine; no private vault is needed for the regression.
The prior clean Simulator fixtures did not exercise this sequence.

The native preparation keeps Repo Swift 0.3.2 and Swift 0.7.2 APIs, applies only
the four Rust-file changes from the merged
[Swift core update](https://github.com/automerge/automerge-swift/pull/243), and
builds its XCFramework. Explicit local Swift packages avoid replacing SwiftPM's
downloaded/signed artifacts. Remove this build preparation when a released
upstream XCFramework includes the fix. Native build **14**, runtime
`orbit-lab-native-4`, separates the corrected engine from cached runtime-3 code.
Publication and physical activation must be verified separately below; no phone
data has been cleared or replaced.

### Expo 58 and the new native boundary

The same native candidate upgrades Expo to **58.0.13**, React Native to
**0.88.0**, and React to **19.3.0**, using Expo's matching native dependency
matrix. Expo Modules JSI **58.0.14** contains the upstream Xcode 27.1 / Swift
6.4 interface fixes. No local Expo compiler patch is needed. Expo 58's generated
scene lifecycle and manifest replace our adapter and its tests/utilities,
removing **167 lines** of workaround code.

Source migration is limited to public React Native instance/style types,
awaiting the now-asynchronous attachment `File.write`, accepting an unknown
initial AppState until its real activation event, and explicitly retaining
single-page web output. No vault/schema/scheduler change accompanies the SDK
upgrade. Runtime **4** separates both native changes from runtime-3 checkpoints.

Fresh workspace lint/build and **386 unit tests**, **26 integration tests**, and
the existing one-test skip pass. The real browser gate passes pairing, review,
offline reload/review, and reconnect convergence without public HTTP/socket
calls. The fresh signed Release Simulator build succeeds. Its generated Pods
and resolved package graph use exactly one local Repo Swift → local Swift →
local XCFramework chain; all **20** prepared artifact hashes match, and the
effective Rust dependency is **0.12.0**, not the released 0.7.2 binary.

The actual Release Simulator gates also pass:

- **14,000 tasks / 1,206,232-byte catalog**: native → JavaScript and JavaScript →
  native reviews, visible offline PNG, offline review, cold reopening, and upload
  of reviewed documents outside the first 50. Three saved reviews are independently
  verified in both native files and server data.
- **53-task personalized FSRS/mixed queue**: the same review, attachment,
  durability, and convergence assertions pass using Andy's calibrated weights.
- **53-task update gate**: two real runtime-4 Expo checkpoints each record a
  successful launch and zero failures. Native/JS foreground offers appear
  immediately, including over a revealed answer; Later suppression/manual
  reoffer, unreachable-laptop behavior, and three saved reviews survive cold
  reopening. Simulator installer handoff is not physical OTA-install proof.
- **Home Screen widget**: actual Reveal → answer → Remembered interactions twice
  advance to the third prompt. The ordinary coordinated JSON contains both
  pending reviews. This proves the widget/handoff boundary, not their delivery
  to the live server.

Archived and exported native **14** with the normal private **443** origin,
runtime **4**, unchanged app/widget identities and App Group. The publication
checks both app and extension ad-hoc profiles, expiry, and Chonk registration.
Private HTTPS discovery, manifest, full IPA SHA-256, HEAD, and byte-range delivery
match the exported **17,603,103-byte** IPA. Its SHA-256 is
`381b2e98a3db377c2e0ce5151aa6a2e82bb308f1bc670e88eaa2ea6bc089aa39`.
Previous release URLs remain available. No new live JavaScript checkpoint or
backend restart was needed; build 14 contains the tested code and cannot select
cached runtime-3 checkpoints.

Installed that exact exported ad-hoc app over Orbit on Chonk without uninstalling
or clearing data. CoreDevice confirms installed version **14**. Its initial and
console-attached cold launches stay alive without `PatchLogMismatch` or the
poisoned-lock crash; the same process remains running after detaching the host
console. Independently decoded a private, read-only copy of all **161 cached
documents**: every document's heads match the laptop's persisted counterpart,
with **zero** missing documents, mismatches, or diagnostic server writes. No
physical-device review was manufactured for this check. Direct device installation
and successful launch are proven; this does not add another physical
`itms-services` installation proof or visual widget confirmation on Chonk.

Private receipts: `/private/tmp/orbit-sdk58-{checkall-final,web-smoke}-20261016.log`,
`/private/tmp/orbit-sdk58-native14-{review,fsrs,update,widget}-smoke-20261016.log`,
`/private/tmp/orbit-sdk58-native14-publication-proof-20261016.json`, and
`/private/tmp/orbit-native14-chonk-convergence-proof-20261016.json`. Simulator
receipts are retained in `orbit-lab-review-gate.F06Ljd` (large catalog),
`.6HwWvr` (FSRS), and `.8Yr73j` (updates) under the macOS temporary directory.
The temporary update route and test selection were restored; private health and
readiness still pass. Public Firebase and the live Lab vault were not replaced.

## 2026-10-16: commit and publish the maintained Lab

The pending implementation is committed as a linear source narrative:
`87144bc7` covers local supervision, kernel-held writer ownership, and oversized
native catalog messages; `9a508485` covers calibrated FSRS, shared queue policy,
authoritative UI projections, and removal of the live legacy Event API;
`51bcd3f3` covers immediate update offers and durable checkpoint publication.
`803a5deb` enables the retained checks for `lab` and removes the obsolete schema
generation job. The documentation commit records the current architecture,
scope, and evidence.
The requested source destination is `origin/lab`; public Orbit deployment is
not part of this release.

Fresh `checkall` passes lint/build, **384 unit tests**, **26 integration tests**,
and one pre-existing skip. The prior real browser, native widget durability,
14,000-task Release Simulator, and personalized FSRS gates are detailed below.
No further scheduling cutover, calibration, vault migration, or phone data reset
was performed.

Published private checkpoint **e4c21ca7-19ed-4486-a932-5fa5f1a3048e**, runtime
`orbit-lab-native-3`, for the existing native build **13**. Export/publication
took 9.5 seconds and retained the preceding checkpoint. Build metadata is set
to 13 explicitly; no new signed binary is needed. The local managed backend
was gracefully restarted onto the committed build and is ready through private
HTTPS with its existing vault and pairing configuration.

Actual protocol-1 HTTPS discovery selects the new checkpoint on the normal 443
origin. All **110 assets plus the launch bundle** download with matching SHA-256
and content-key hashes. Matching-current and incompatible-runtime requests return
the expected no-update directives; the native descriptor remains build 13.
The launch SHA-256 is
`b126a5960bc104703db74dc1f4cb30d94887ef2ca2187ea9cc48f6d597c80dea`.

Hermes v98 embeds Expo's random temporary input path in debug information, so
separate exports are not byte-identical. Compared the complete **4,935,736-byte
executable section** with the Simulator-tested export, normalizing only the
header's total-file-length field: they match. Manifest/asset integrity is still
checked against the actual newly published bytes. Physical activation on Chonk
is not claimed by these server-side checks.

Private receipts: `/private/tmp/orbit-lab-release-checkall-20261016.log`,
`/private/tmp/orbit-lab-release-publication-20261016.log`, and
`/private/tmp/orbit-lab-release-proof-20261016.json`.

## 2026-10-15: maintenance and simplification

Audited the current domain/storage, app lifecycle, widget boundary, private
server, and operator/build paths. This is a source cleanup, not another schema
change or rollout. The live Lab service, vault, phone, pairing configuration,
and published checkpoint are unchanged; no commit/history rewrite was made.

- Retired the unused public Event/EventReducer API and sample-data event
  generators. Its 347 original implementation lines and reducer tests moved to
  test-only historical parity support, not deleted reference coverage. Production
  compilation excludes that support; `TaskRepetitionOutcome` remains in the task
  domain. Old generated output was recoverably moved to
  `/private/tmp/orbit-core-generated-before-retirement.9IKhPP/core-dist` before a
  clean rebuild, since TypeScript does not remove no-longer-included outputs.
- Removed unused review-session actions, nested state updates, and undo writes
  inside React updater callbacks. Mark/refill transitions are pure. Deleting the
  sole review item now yields a null index instead of an invalid `-1`; three
  deletion/undo regressions cover the boundary.
- Extracted the actual initial-read/subscription lifecycle into a small tested
  function. Once a live queue arrives, a late initial success **or failure**
  cannot replace it; synchronous subscriptions and canceled reads are covered.
  This fixes a possible false unavailable screen, not an attribution of every
  historical load failure to that race.
- Widget publication now accepts only immediate queue snapshots. Removed unused
  lazy sources and epochs; one existing serial lane still orders publication,
  import, and selective acknowledgement. Repeated close calls await that lane.
  Native alert dismissal is idempotent, so an old callback cannot unblock a
  successor prompt.
- Subscriber exceptions no longer reject an already-durable review or prevent
  later subscribers from being notified. A reopen-and-verify regression retains
  explicit persistence failures. Reused queue options avoid a second catalog
  review-count scan, and catalog priority uses the shared memory type.
- JS/native publication share small synced-write/directory helpers. JS publication
  now syncs the completed staging directory and its published parent before
  selecting it. Injected sync failure leaves the previous checkpoint usable.
- Removed native build shortcuts that bypassed the required Repo Swift patch.
  Updated the architecture/reading guide and replaced the completed setup plan
  with current scope, boundaries, and remaining gates.

The original Orbit scheduler remains necessary for historical replay. Catalog
repair, task-first persistence, native fetch/reconnect workarounds, and widget
cross-process durability also remain justified. Kept Expo's startup updater:
it supplies a JS-independent next-launch fallback, while the controller's
initial check supplies an immediate offer. Expo serializes those procedures;
removing one changes behavior and requires a separate native decision. No new
cache, index, compatibility path, GC policy, or operational framework was added.

Final `checkall` passes lint/build, **384 unit tests** (one pre-existing skip),
and **26 integration tests**. The real browser gate passes pairing, review,
offline reload/review, and reconnect with no public HTTP/socket calls. All three
native widget reader/writer/handoff gates pass, including process races and
interrupted writes. Five Python calibration tests also pass.

The actual Release Simulator activates the final source through a real isolated
Expo checkpoint, then passes the update/review gate with **14,000 tasks** and a
**1,206,648-byte** catalog sync response. It verifies immediate native and JS
offers without a review, an offer over a revealed answer, Later/manual reoffer,
installer handoff, native-release fallback, three saved observations including
an independent JS review, cold checkpoint activation, and quiet offline checks.
Selection and private Serve routes restore cleanly. Fixture/receipt:
`orbit-lab-review-gate.akTMPL` in the Mac's temporary directory. The initial run
had stopped during fixture creation at the runner's one-minute process timeout,
before pairing or serving anything; preparation now has a separate finite
five-minute budget for its thousands of durable file writes. UI command and
assertion budgets are unchanged. No physical installer proof is claimed.

The same final checkpoint also passes the focused **53-task personalized FSRS**
review gate with mixed ordering: native → JS, JS → visible native advancement,
offline PNG rendering, durable offline review bytes, and cold reconnect after
the three reviewed tasks leave the first-50 window. Native file decoding and a
fresh independent JS peer verify all three observations and derived schedules.
Its fixture/receipt is `orbit-lab-review-gate.aQp5Gy`; the previous Simulator
selection is restored. This small fixture checks policy/continuity, not the
large-message boundary proved by the separate 14,000-task run above.

Final check logs are `/private/tmp/orbit-maintenance-checkall-final-20261015.log`,
`/private/tmp/orbit-maintenance-web-smoke-20261015.log`, and
`/private/tmp/orbit-maintenance-native-update-smoke-final-20261015.log`;
the personalized review log is
`/private/tmp/orbit-maintenance-fsrs-review-smoke-20261015.log`.

## 2026-10-15: immediate foreground update offers

Andy changed the policy to offer available updates immediately on foreground,
including with an unrevealed question or revealed answer on screen. The client
no longer passes a queue/session eligibility flag or a saved-review callback to
the update controller. Pending review/delete/undo writes still defer the prompt
and are rechecked at the actual reload/install tap. Applying updates remains
explicit; Later suppresses the same offer for the mounted session, and offline
automatic checks remain quiet. No native code or runtime change was needed.

All 23 focused controller cases pass; workspace lint/build, 371 unit cases
(one pre-existing skip), and 25 integration cases pass. The actual optimized
Release Simulator uses an isolated HTTPS Serve route on 9443 and a disposable
53-task vault. It shows a native offer before any review, and a real JavaScript
checkpoint offer on foreground with the answer already revealed. Dismissing
preserves that answer. The runner also verifies Later suppression, manual
reoffer, native installer handoff, same/missing native fallback, three durable
review observations, cold-launch checkpoint activation, and quiet offline
foreground checks. Simulator handoff is not evidence of physical installation.

All UI assertions passed. A transient CoreSimulator `Mach error -308` interrupted
the runner's final selection restoration; its isolated Serve route and server
were cleaned up, and rerunning the ordinary restoration action succeeded with
other records preserved. This was cleanup failure, not an app/assertion failure.
The fixture and receipt are `orbit-lab-review-gate.V9d9hX` in the Mac's temporary
directory. Logs and the receipt are retained under
`~/Library/Caches/Orbit Lab/native/validation-20261015/immediate-updates`.

The live private checkpoint is **3649b188-cda9-4faf-b440-c961c2924a95**, runtime
`orbit-lab-native-3`. Actual protocol-1 HTTPS discovery selects it with the normal
443 private origin, and the downloaded launch asset matches its SHA-256.
Native build 13 is unchanged. Andy confirmed that Chonk offered the update
through its existing menu and completed the reload. Future offers use the new
policy; an automatic foreground offer on the physical phone still awaits a
subsequent release.

The following read-only server-file audit at **2026-10-16 00:38 UTC** finds all
**five** post-cutover review observations reflected in their catalog entries,
with **zero** mismatches among the inspected task documents. Independent FSRS
calculations and mixed-queue ordering assertions pass. The five reviewed-task
conflicts have disappeared; the remaining 48 conflicts have structurally
identical decoded values in every variant. The audit performed **zero storage
writes**, so it did not repair the catalog itself. This verifies real-vault
review-projection catch-up after the reload, not a direct inspection of every
catalog row on Chonk. The raw audit is retained privately as
`/private/tmp/orbit-after-immediate-update-live-audit-20261015.json`.

## 2026-10-15: catalog sync exceeded the native WebSocket limit

All three recent FSRS reviews reached their authoritative server task documents,
but Chonk's catalog had not received the server's FSRS backfill. A read-only copy
of its catalog had 51 FSRS rows versus 10,888 on the server. The server retained
50 catalog conflicts, including the three newer review projections; this was
not loss of review observations or an FSRS calculation failure.

Replaying those exact document copies in memory converges normally. The required
server → phone CBOR sync message is **1,154,895 bytes**, larger than URLSession's
**1,048,576-byte** default. Repo Swift 0.3.2 neither overrides nor exposes that
limit. Replaying the real message over a disposable loopback WebSocket with
Apple's Foundation API fails with `NSPOSIXErrorDomain Code=40: Message too long`
at the default, and receives every byte with the new limit. This explains why
small phone → server review writes succeeded while the catalog stayed stale.

The native installer resolves the pinned Swift package, then applies a guarded,
idempotent one-line patch before compilation. It sets the upstream provider's
`maximumMessageSize` to the same finite **16 MiB** budget used for server ingress.
Repo Swift still owns the transport/protocol; no replacement provider, scheduler,
index, or UI recovery path was added. Source drift fails the preflight rather
than silently dropping the patch. Remove it once upstream exposes the setting.
Native runtime 3 separates this binary change from existing compatible updates.

The Simulator fixture now creates 53 due tasks and enough ordinary future tasks
for a 14,000-entry catalog. It asserts the actual Automerge response exceeds
1 MiB. Independent verification fetches only the relevant 53 task documents;
the future bodies are not needed to display or verify the queue. A separate
server regression uploads/downloads an incompressible document exceeding its
former 2 MiB ingress limit.

The default-limit build 12 fails that real Simulator gate with `Vault unavailable`
and `Timed out fetching native Automerge document`. The response is 1,216,189
bytes. Build 13 passes against the **same** dataset and partially downloaded
native cache, without uninstalling or clearing data: native review → fresh JS
peer, JS review → visible native advancement, offline PNG/cold launch, durable
offline review bytes, and cold reconnect after all three reviewed tasks leave
the 50-task window. Personalized FSRS weights and the mixed queue remain active;
independent file decoding verifies the three observations and derived due dates.
The previous Simulator selection is restored by both runs.

Workspace lint/build, 371 unit tests (one pre-existing skip) and 25 integration
tests pass. A signed Release archive for native build **13**, runtime
`orbit-lab-native-3`, is retained. Its matching private checkpoint is
`b6d24099-d05a-4eee-ade0-33862434f580`; older runtime checkpoints are unchanged.
The managed private backend was gracefully restarted with the shared budget,
and its private HTTPS readiness check passes.

The first ad-hoc export was blocked by Xcode's saved account
(`missing Xcode-Username` / `missing Xcode-Token`). After Andy opened his personal
Apple account in Xcode, exporting the **same archive** succeeded without a
rebuild. Native build **13 is now privately published**. Strict signature
verification, app identity, runtime 3, private origin, App Group, and unexpired
ad-hoc app/extension profiles including Chonk all pass. The IPA is 17,197,109
bytes, SHA-256
`7221d764cbf5d2a881996f21447a6de618dc4a737aeaeece1ff644f0bcc5e494`.
The live private descriptor and installation manifest select build 13. A complete
HTTPS download matches that hash; HEAD, byte-range responses, and readiness pass.
Native build 12 does not receive the runtime-3 JavaScript checkpoint; it discovers
the native replacement through the ordinary update menu. Andy subsequently
installed it, and CoreDevice independently confirms build **13** on Chonk.
The first post-install read-only audit still retained 53 conflicts and the five
authoritative reviews. A copy from the
previously selected native store still has only 51 FSRS rows. The phone became
inaccessible wirelessly and the server had no connected sync socket; another
awake, foreground connection was needed before distinguishing a remaining sync
failure from an unavailable/backgrounded client. No phone data was cleared.
The later reload and read-only catch-up evidence are recorded above.

A later read-only audit after restart finds **five** authoritative FSRS reviews,
including the two completed during this investigation. Independent FSRS
calculations match all five; no live storage writes were made by the audit.
At that point the old phone still could not receive the catalog, which had 53
conflicts; real-vault repair was not yet verified.

Before the subsequent policy change recorded above, the reported lack of a
foreground update dialog matched the then-implemented gate: discovery ran on
foreground, but an automatic dialog waited for an empty queue or a saved review
boundary. Even an unrevealed question blocked it. Manual checking bypassed that
prompt gate, not the pending-write guard. The 31 controller/native-discovery
tests passed. This explained that initial behavior, not whether a particular
foreground check had actually occurred on the phone.

Proofs and logs are retained under
`~/Library/Caches/Orbit Lab/native/validation-20261015/catalog-sync-limit`;
the synthetic fixture is `orbit-lab-review-gate.Da7jvb` in the Mac's temporary
directory. The oversized-message reproduction used copied real bytes only,
with zero live storage writes. Nothing was deployed to public Orbit.

## 2026-10-15: supervised local service and crash-safe writer locking

The update-check failure was a 502 from the private HTTPS proxy: its local
backend was gone, while both Tailscale peers remained connected. A leftover
`.writer-pid` named a nonexistent process. Its bytes were preserved before the
manual recovery; the original process's cause of death remains unknown.

The backend now runs directly under a user-owned macOS LaunchAgent, independently
of the terminal, TypeScript watch supervisor and Metro. `RunAtLoad`/`KeepAlive`
configure login startup and process-exit recovery, with a ten-second restart
throttle and thirty-second graceful-shutdown allowance. `lab:service` manages
installation, status, graceful restart, stop/start and removal. It records
absolute Node/checkout/config paths, not credentials. Timestamped lifecycle and
shutdown failures go to `~/Library/Logs/Orbit Lab/server.log`. Stop/restart waits
for the unloaded process to exit, not merely for `launchctl bootout` to return.

The PID-file protocol is replaced with an OS-held exclusive lock on the stable
`.writer-lock` inode: macOS `lockf` (Linux `flock`) locks an inherited descriptor,
then exits while Node retains ownership. Closing the descriptor or process death
releases ownership. No helper stays running and no lease, heartbeat, stale-PID
deletion or new package is needed. A retained lock file is not an active lock;
operators must never unlink it. Offline snapshot/restore, calibration and importer
paths share this exclusion; snapshots omit the lock inode.

Workspace lint/build, 369 unit tests (one pre-existing skip) and 24 integration
tests pass on macOS. Cross-process regressions cover duplicate writers, symlink
refusal, stable inode reuse and repeated SIGKILL/reacquisition. A temporary
LaunchAgent using a separate synthetic vault recovered from two forced crashes
in about 1.3 seconds each with its test-only one-second throttle, retained its
root, refused a second writer, and passed a graceful unload/reload. The temporary
job was removed. This does not claim a forced crash of the real vault, a reboot
test, Linux execution or recovery from a process that stays alive but hangs.

The actual foreground supervisor was stopped gracefully and replaced with the
installed login service. Its graceful restart passes, with persistent stop/start
logs. Native build 12 and both runtime checkpoints are unchanged; the complete
private HTTPS download/hash and HEAD/Range checks pass. `lab:dev --client-only`
now owns only compiler/Metro. Closing that supervisor left the managed backend
PID and private readiness unchanged; the client loop was subsequently restored.
Receipts are retained under
`~/Library/Caches/Orbit Lab/native/validation-20261015/local-service`.

## 2026-10-14: mixed FSRS backlog selection

The shared selector now interleaves highest-retrievability and oldest-due
choices before the 50-task cap. Both lanes choose the earliest-due component of
each task and deduplicate tasks. Unscored cards enter the oldest lane; actually
due FSRS-era retries precede the mixture, without the ordinary sixteen-hour
lookahead. Historical failures are not retrospectively turned into retries.
Saved-review count since cutover rotates the starting lane after each review,
including remote reviews and relaunches. It is derived from task observations
along with compact catalog memory summaries, not an additional queue cursor.
The same selector drives startup priorities and final projected queues. Widget
snapshots retain that order and their revision hash includes order changes.

The one-time bounded backfill retained a complete snapshot at
`~/Library/Application Support/Orbit Lab/recovery/mixed-queue-20261014`, then
populated 10,888 catalog entries in batches of at most 64 task histories.
Independent committed-byte comparison confirms all 12,933 non-catalog chunks
are unchanged, including the root, scheduler, tasks, observations and
attachments. Every original catalog due date is unchanged. The normal private
development loop was restarted and readiness succeeds. The compressed catalog
grew from 957,908 to 1,152,014 bytes. Desktop JS/Wasm selection took a median
1.7 ms; combined catalog loading/materialization/decoding increased from about
100 to 144 ms in that benchmark. These are warm-process desktop measurements,
not Chonk launch timings; native/physical launch performance remains unmeasured.

Final workspace lint/build, 367 unit cases and 24 integration cases pass, with
one pre-existing interpreter skip. The three Foundation widget handoff/reader/
writer gates pass, including cross-process races and interrupted writes. Fresh
review found and fixed stale-catalog reselection after a task becomes a future
retry, and the app-local final-card refill bypassing the ten-minute wait. Both
have regressions. The real-history optimized Release Simulator gate passes
native-to-JS and JS-to-native advancement, offline PNG rendering/save and cold
reconnection. Its first high-retrievability task is outside the former oldest-50
window; independent server and native-file checks confirm all three reviews and
the alternating queue. Its synthetic reviews are confined to the disposable
fixture, never the private live vault.

Native build 12 is archived with runtime `orbit-lab-native-2`. Its first export
reported "No Accounts"; the detailed log identified unreadable saved account
credentials (missing Xcode token), despite the account and team appearing in
Xcode. Retrying the same archive after Andy opened Accounts succeeded without
account/keychain changes by the agent. The Home Screen widget gate exposed that unsigned
Simulator builds lack their App Group; the local build script now uses ordinary
ad-hoc signing so that gate tests the real shared container. The signed Simulator
build has its actual App Group, and the medium widget was placed through normal
SpringBoard controls. The Home Screen gate passes Reveal/answer/review progression
through the supplied order with deliberately non-monotonic due dates (30,10,20).
The runtime-2 update gate also passes on this signed build: it activates the exact
final JavaScript through the ordinary menu, exercises native and JS foreground
offers only at safe review boundaries, and verifies Later/manual reoffer,
offline/cold launch and saved-review persistence. Its installer handoff remains
Simulator-only, not physical OTA installation proof. A final real-history mixed
FSRS review gate also passes after activating that exact checkpoint on the signed
binary. All temporary routes and selections are restored.

Published runtime-2 checkpoint `6249d4f3-91ce-4fc8-aab6-05dd31ab60b9`. All 111
assets (5,869,794 bytes) were downloaded through the normal private HTTPS origin
and hash-verified. Runtime-1 remains on checkpoint
`15eb11e9-0c06-487b-9504-1c1308cb5988`; the older binary cannot accidentally
acquire the new widget assumptions.
The retained archive's native identity is build 12, runtime 2, with the normal
443 update origin rather than the Simulator-only 9443 origin. Native build 12
is now privately published. App and widget signatures verify recursively with
the Orbit team, matching build numbers and App Group entitlements; both
unexpired ad-hoc profiles include Chonk. The HTTPS IPA matches the local SHA-256,
and installer manifest, HEAD/Range serving and build-11 update discovery pass.
Physical installation remains Andy's acceptance check. This one native update
removes WidgetKit's independent due-date sort; subsequent queue-order experiments
can remain JavaScript-only. Receipts and final gate logs are retained in
`~/Library/Caches/Orbit Lab/native/validation-20261014/mixed-queue`.

## 2026-10-14: personalized FSRS scheduling activated

The private Lab vault now selects FSRS-6 (`ts-fsrs@5.4.2`) from its root policy.
Remembered maps to Good (3), Forgotten to Again (1), with 90% requested retention
and deterministic intervals. Forgotten keeps the existing ten-minute retry;
Skip defers one day without counting as recall. Historical observations warm
FSRS memory, but original due dates/intervals remain until each component's
first post-cutover review. The shared projection drives saved app state and
starburst previews; neither Swift nor the widget gained a separate scheduler.

One local calibration used the retained complete October 13 export. Of 105,856
raw review observations, 30,097 were exact imported legacy aliases; fitting
counted each once without deleting any history. After excluding 950 skips,
74,809 binary reviews across 6,986 component histories provided 56,880 positive-day
targets; same-day reviews remained context. The latest 20% of targets were held
out chronologically. Compared with defaults, fitted weights reduced held-out
log loss from 0.516651 to 0.511167 (1.06%) and binned RMSE from 0.062849 to
0.055685 (11.4%). Only after both improved were all targets used for the final
21 weights. The pinned `fsrs-rs-python==0.9.3` optimizer runs locally, is not
shipped to clients, and agrees with the TypeScript memory equations on the
representative parity histories. Binary data does not separately identify
Hard/Easy behavior. Source export, reports and weights remain private.

Full-vault preflight preserved all existing scheduling fields for 13,705
components across 10,888 tasks, with no new projection issues. Simulating a
Remembered review of each currently due component produced a median 45-day
FSRS interval versus 913 days with the old scheduler; this is a hypothetical
comparison, not a rescheduling of the queue. Future review load may increase.
Complete workspace lint/build, 331 unit cases and 24 integration cases pass,
with one pre-existing interpreter skip; all five calibration-script tests pass.
The optimized Release Simulator loaded the actual new JavaScript through Expo,
then passed the ordinary app-controls native-to-JS, JS-to-native, offline-save,
and cold-reconnect gate using the personalized weights. Independent server and
native-file checks verify all three reviews and their FSRS catalog dates. No
test-specific UI branches or synthetic reviews were added to the live vault.

Published checkpoint `15eb11e9-0c06-487b-9504-1c1308cb5988` supersedes the
foreground-update checkpoint below, retaining runtime `orbit-lab-native-1` and
native build 11. All 111 assets were fetched through the normal private HTTPS
origin and hash-verified. After Andy confirmed loading it on Chonk, the complete
development supervisor was stopped cleanly and the one-time operator retained
`~/Library/Application Support/Orbit Lab/recovery/fsrs-cutover-20261014` before
changing only the scheduler policy. Cutover is **2026-10-14 18:51:46.965 UTC**.
Independent decoding of committed root bytes confirms the selected policy and
weights, while SHA-256 comparison verifies all 12,949 non-root committed chunks
are unchanged, including tasks, observations, attachments and catalog. This
verifier constructed no Repo and made no writes. The normal development loop
was restarted and private health/readiness succeed. A separate in-memory client
then fetched the exact calibrated policy through the real private HTTPS
WebSocket endpoint without submitting document changes. No public Orbit state
was changed. A physical post-cutover FSRS review remains a user acceptance check;
the automated end-to-end review proof is from the Simulator.

Calibration evidence is retained at
`~/Library/Application Support/Orbit Lab/fsrs-calibration-20261014`; validation
logs, Simulator receipts and cutover verification are at
`~/Library/Caches/Orbit Lab/native/validation-20261014/fsrs`.

## 2026-10-14: foreground update discovery without interrupting reviews

Launch and real background-to-foreground transitions now check native and
JavaScript releases independently. Native replacement takes priority; otherwise
a JavaScript checkpoint downloads in the background. Automatic prompts wait for
the current answer's durable local save or an empty session. Later suppresses
that same offer during the mounted session; the menu explicitly requests a
result again. Offline automatic checks stay quiet. Reload/install still require
approval and recheck pending writes at the action itself.

The 23 focused lifecycle/prompt tests pass. Final `bun run checkall` passes
lint, workspace build, 294 unit cases and 24 integration cases, with the one
pre-existing interpreter skip. The optimized Release Simulator loaded the actual
new code through Expo's normal checkpoint download/reload, without rebuilding
the native binary or adding application test branches. Its existing isolated
53-task gate verifies both native and real JavaScript foreground offers, holds
each through the question and revealed answer, and presents only after a saved
review. It also verifies Later suppression, explicit manual reoffer, independent
server persistence of three observations, cold-launch activation, and quiet
offline foregrounding. Observed Home/app process IDs prove these foregrounds
are not cold starts. Expo's native successful-launch records confirm the exact
checkpoint activations. One intermediate runner attempt failed its fixed Home
delay after a successful JS activation; the runner now observes the background
transition and captures failures instead of assuming it after 750 ms.

Published JavaScript checkpoint `9a4308a9-0c03-4ff5-86f8-b9c98e071fd0` at the
normal private origin for unchanged runtime `orbit-lab-native-1`. Every launch
and supporting asset was fetched through Tailscale HTTPS and SHA-256 verified.
Native build selection remains 11 and readiness succeeds. This does not claim
Chonk has activated this checkpoint yet: its current menu can download/reload
it once, enabling subsequent foreground checks. No Chonk operation or live-vault
mutation was part of these tests. The temporary fixture server/Serve mapping
were removed and the previous Simulator selection restored. Proof JSON,
screenshots, suite logs and publication receipts are retained under
`~/Library/Caches/Orbit Lab/native/validation-20261014/foreground-updates`.

## 2026-10-14: signed native build 11 published privately

After Andy restored Xcode's developer-account session, the retained build-11
archive exported successfully with the existing `release-testing` options; no
rebuild or source change was needed. The resulting IPA is 17,170,391 bytes.
Strict recursive signature verification succeeds with Apple Distribution for
team `MQ22N839N8`. App and widget both retain build 11, their existing bundle
identifiers and `group.com.withorbit.native`; both distribution profiles include
Chonk, disable development debugging, and expire 2027-09-07 16:36:40 UTC.

The ordinary publisher selected build 11 on the existing private endpoint.
Downloading the complete IPA through Tailscale HTTPS reproduces the local
SHA-256 `ee8487b4a18c4f6a8172705d18f7d0934cb4ccc4aa3e05a328cffb46c01ba0b7`.
The XML installation manifest validates; HEAD returns the correct MIME/length;
a 1,024-byte Range request returns 206. The real client discovery helper offers
11 to installed build 10 and no replacement to installed build 11.

Published checkpoint `cca3b294-f516-4de3-9111-054ff029ad98` for the unchanged
`orbit-lab-native-1` runtime so the existing phone binary can acquire the new
native-update menu through its ordinary JS update/reload. A subsequent menu
check can offer native build 11. All 111 checkpoint assets (5,810,391 bytes)
were downloaded through the real private endpoint and their hashes verified.
No native dependency, entitlement, runtime version or vault format changed.

The private backend had stopped with a stale PID lock. Verified the recorded
PID no longer existed and no writer/listener remained, retained the stale lock,
and restarted the normal development loop. Private readiness now succeeds.
Signed artifacts, metadata receipts and export/checkpoint logs are retained at
`~/Library/Caches/Orbit Lab/native/validation-20261014`; the immutable selected
IPA/manifest also remain in the configured updates directory.

Andy then used the in-app update flow and reported that it appeared to work.
A read-only CoreDevice inventory independently confirms Chonk now has Orbit Lab
`com.withorbit.native` version 1.0.0, native build 11, replacing build 10. This
closes the physical OTA installation and installer-access-through-Tailscale
gates; it is not merely the Simulator accepting the installation URL. No install,
launch or review was initiated by the verification. Private readiness succeeds.
After the update, Andy completed one app review and one widget review. Direct,
read-only decoding of the private server's committed snapshot/incremental bytes
confirms both observations: app `review/-jv2gsksT-eraaHnLPK8Ew` at 16:36:04 UTC
and widget `review/NeXe-oh3TTi1XQUksnXLCw` at 16:36:14 UTC on October 14.
Both are remembered outcomes; their catalog entries reference the correct task
documents and reflect the current task heads. The widget observation appeared
after reopening Lab to import its outbox, as designed. Verification created no
Repo or network peer and made zero storage mutations. This closes the
post-update app/widget review persistence and delivery check; it is not a new
offline or full-vault recovery test. Public Orbit is unchanged.

## 2026-10-13: private native update handoff

The existing update menu now checks the installed native identity/build before
Expo's runtime-compatible JavaScript check. A newer native build offers an
explicit `itms-services` installation; both that handoff and a JS reload recheck
the pending-review-write guard. Same/missing native releases retain the JS path,
and loopback development skips native discovery. No new distribution service,
account store, native module or public endpoint was added.

Ad-hoc publication derives identity/build/origin from the exported IPA, requires
unexpired registered-device distribution profiles for the app and extensions,
and selects the release only after complete immutable artifact copies. The
existing private server supplies native discovery, XML manifests and resumable
IPA downloads independently of Expo runtime matching.

Server integration gates pass 20/20, including six native publication/download
cases. The eight native-discovery unit tests cover identity, build comparison,
private origins, loopback fallback and bounded failures. Workspace unit tests
pass 271 cases with one pre-existing interpreter skip. All four importer
integration cases pass on rerun; the first full run's 15-second inventory test
timed out during the full native archive compilation rather than failing an
assertion. A subsequent complete `bun run checkall` passes lint, workspace
build, all 271 unit cases and all 24 integration cases.

The current-source optimized Release Simulator build passes the new
`ios:native-update-smoke` gate with an isolated ordinary 53-task vault and
private HTTPS fixture port 9443. Actual controls show the newer-build offer;
Later retains the same prompt; same/missing native builds reach the real Expo
up-to-date dialog; a review is independently observed on the server and survives
cold relaunch; an unreachable laptop produces an error without losing the
queue. The Simulator accepts the `itms-services` URL without an observable
installation, so this does not verify iOS installation or replacement. AXe
omits the visually present menu's modal children; only that menu row uses a
screenshot-observed coordinate tap, not a test branch in app code. The gate
restores the previous selection and removes only its temporary Serve mapping,
leaving the live 443/8443 routes unchanged.

The existing full Release review smoke also passes on that same built app:
native-to-JS and JS-to-native queue advancement, offline PNG rendering, a durable
offline review, and cold reconnection after reviewed tasks leave the first-50
window. Both gates restore the previous selection. Proof JSON, screenshots,
complete check output and UI-gate logs are retained under
`~/Library/Caches/Orbit Lab/native/validation-20261013`.

The optimized iPhone archive for build 11 succeeded and is retained at
`~/Library/Caches/Orbit Lab/native/Orbit-11.xcarchive`. Its embedded update URL
is the normal private origin, not the Simulator fixture port. The first ad-hoc
export reported an updated Apple agreement; Andy accepted it, and the retry
no longer reports that error. Export is still blocked by Xcode's `No Accounts`
and missing Orbit-team distribution-certificate/private-key errors. No native
release has been published to the live Lab, and Chonk has not been changed.
Andy is away from the Mac; actual OTA installation, Tailscale installer access
and in-place app/widget
data preservation remain explicit physical-device gates.

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

## 2026-10-16: stable source identities and disposable badge preparation

Current boundary: interpret → prepare disposable copies → source-owner conditional
save → import accepted exports. The earlier combined import-and-stamp API and its
selector flags have been removed; neither Markdown nor JSON import writes source
files. The interpreter readme is the current command reference.

Task badges name existing TaskIDs without reformatting Markdown. Their source
ranges cover ordinary/multiparagraph Q&A and clozes; standalone BearID footers end
answers rather than becoming answer text. Reinterpretation checks unchanged task
specs, source identity, and cloze ranges. Badged wording edits update the existing
task/document and retain observations and FSRS state. Without an accepted badge,
content-hash matching still applies; ambiguous matches are not guessed. Cloze
component-count changes remain rejected, and same-count reordering is not safe.

The separate Bear tool owns temporary exports, backups, attachment serialization,
and expected-version native saves. A newer native edit discards only its generated
proposal; ordinary sync then exports current Bear text. Real local human edits
remain protected. The existing periodic workflow scans even after an unchanged
export: missing badges identify deferred work, without a new queue, cursor, cache,
or daemon. Orbit has no dependency on the Bear tool.

### Source round-trip gates and current scope

The frozen 4,882-note / 3,574-prompt corpus retained byte-identical ingestion JSON.
The current collection preview captured 4,884 files / 3,578 prompts, used the real
pure ingestion plan (zero mutations), and found no unsupported/ambiguous cases.
Every proposed ID already existed, with identical specs. The subsequent ordinary
Bear refresh changed none of those source fingerprints.

All 4,856 Bear-managed files had valid matching raw BearIDs and ledger hashes.
Their eligible cohort was **763 notes / 3,548 missing badges**, including 3,439
reviewed tasks. Twenty-eight unmanaged local files were left byte-identical;
26 contain one prompt each. They are not part of native Bear writeback.

Live rollout first round-tripped three existing reviewed notes: Mozer 2009
(single Q&A), Gwern (multiparagraph), and Do your own thinking (cloze). Native
readback, exact source comparisons, document identity, observations, and FSRS
checks passed. The remaining 760 notes then accepted their badges with no native
version deferrals. Two preexisting Bear-tool defects were caught and fixed:

- Long exported titles could exceed the filename limit when a backup suffix was
  appended. Paired backups now use the existing stable note-ID/timestamp stem
  (`9547ddc`). The failed first attempt changed no native note or export.
- The shared manual-import helper unintentionally uncommented hidden tag lines.
  All 19 affected notes differed by exactly that transformation; no task specs,
  provenance, attachment references, or inventory changed. Their original comments
  were restored while retaining badges. Hidden-tag restoration now belongs only
  to ordinary manual import; generic conversion preserves its input (`37cea9f`).
  No new mode or Orbit-specific branch was introduced.

An independent persisted-file audit through the actual current catalog confirms
all **3,548 TaskID metadata adoptions**, unchanged task URLs/definitions/history,
unchanged scheduler, and all 10,892 vault tasks retained. Apart from badges, every
canonical source now matches its captured original bytes.

### Cold-open gate: upstream loader defect, current state repaired

The final audit exposed an additional failure in Automerge 3.4.1 / Repo
2.6.0-alpha.5: the catalog's one snapshot plus 42 incrementals (3,237,263 bytes)
trigger a Rust allocation trap when concatenated and loaded together. Fresh Bun
and Node reproduce concatenated loading failure. Loading the identical chunks
one at a time succeeds, with no missing dependencies. This was not missing task
writes, nor a reason to extend a timeout.

A disposable same-document snapshot passed fresh ordinary loading and an actual
unmodified, network-free Repo cold-open. Its 10,892 entries, heads, all 3,777
change-byte hashes, and complete history were identical. Under quiesced writer
locks, the private server and importer catalog stores were compacted using the
same snapshot key/order as Repo's ordinary compaction. Only superseded catalog
chunk values were removed; original bytes and a complete post-update vault backup
are retained. Peer identity, sync state, document URLs, heads, and history did not
change. The restarted service is ready and both stores cold-load normally.

This repairs current storage, **not the underlying concatenated-load defect**.
Unrestricted scheduled stamping remains on HOLD; the installed wrapper retains
its two-note pilot restriction. Existing stamped notes still import normally.
Before widening automatic preparation, isolate/fix the upstream loader defect and
repeat the large-update/cold-open gate. Do not add a custom application recovery
layer or assume compaction prevents recurrence.

The final ordinary import made zero mutations; its full before/after comparison
passed. Already-badged preparation made zero native/source writes and succeeded
with an unavailable configuration, proving it requires no vault connection.

### Evidence and checks

- Orbit lint/build, 485 unit tests (one existing whitespace skip), and 32 isolated
  integrations pass. Read-only import/concurrent-edit tests replace the retired
  stamp-after-import failure contract.
- Bear tool: 164 tests pass, two existing environment-gated skips; strict
  TypeScript passes. Regressions cover long ASCII/Unicode backups, backup failure,
  exact comment/tag/attachment round trips, and retained manual-import behavior.
- Eighteen isolated shell cases, Bash syntax, and ShellCheck pass. The installed
  importer command no longer uses the removed flag; wider scheduling is not
  enabled. Existing reMarkable/shared lock protocols are unchanged.
- Installed wrapper SHA-256:
  `7d479160afc784cc7d3621b67e710fb224d905b24ab1e1fd2a8a067feefa0147`;
  isolated installed-wrapper proof: `/private/tmp/orbit-installed-wrapper-AVvxgm/`.
- Current-corpus preview and exact copies:
  `/private/tmp/orbit-current-stamp-preview-bgdKJa/`.
- Native stages, exact comment repair, complete comparisons, compaction archives,
  and final no-op receipt:
  `/private/tmp/orbit-stamp-rollout-G4LM4d/`.
- Original catalog failure and successful normalized cold-open:
  `/private/tmp/orbit-catalog-normalization-proof-hxoUsb/`.
- Authoritative persisted task audit:
  `/private/tmp/orbit-stamp-durability-audit-C4w1LN/proof.json`.
- Earlier real native-edit race/deferral proof:
  `/private/tmp/orbit-native-transform-integration-Ne15oX/proof.json`.

Complete pre/post-update vault snapshots are under the private Lab's
`backups/task-badges-*` directories. Normal per-note Bear backups remain in
`/Users/andym/Work/BearSyncBackup`. No website/reMarkable publication was invoked
for these gates; no app release or cloud/public-service deployment occurred.
