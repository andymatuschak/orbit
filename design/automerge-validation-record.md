# Automerge validation record

These dated checks apply to the source tested at each stage, not automatically
to later commits or the deployed service. The final review history presents the
current implementation; this record retains the experiment's validation and
measurement boundaries. Start with [the review guide](automerge-review-guide.md)
for the code reading order and current regression gates.

Pre-cleanup source and prior history remain recoverable through
`codex/automerge-pre-final-review-20261009`. Earlier released-build identities
are retained through `automerge-dogfood-pre-review-20261006` and
`codex/automerge-pre-review-cleanup-20261006`.

## Earlier candidate checks

Baseline verification before this consolidation (2026-10-06): full workspace build, app typecheck,
lint, frozen offline install, 374 non-backend tests, 94 emulator-backed backend
tests, 14 real-server integration cases, the actual Chrome hosted lifecycle
suite, and the Release Simulator hosted-fetch/convergence/repair gate passed.
The production AMD64 image is also built from clean source, not local `dist`.
This is evidence for the cleaned tree, not a claim about intermediate commits
or the currently deployed candidate.

Shared-store/JSON consolidation verification on 2026-10-08: workspace build,
app typecheck, lint, 401 non-backend tests, 16 real-server integration cases,
the five-case durability/convergence subset, and the actual Chrome hosted
lifecycle suite passed. Release Simulator gates passed cold loading, durable
reviews, warm remote convergence, pre-connection catalog repair, and offline
widget-review import/acknowledgement verified by an independent file reader.
An additional install-over-data check recovered the exact pending review that
first exposed the uncached-tail bug, with exactly one durable observation and
no reseed or journal clearing. Actual
Home Screen WidgetKit tests passed two Reveal/review pairs, Markdown layout,
and link rendering. Swift 6 tests exercised coordinated independent-process
writes, interruption/replay, selective acknowledgement, and old-widget recovery.
This is local source validation, not a deployment or new Chonk measurement.

Bounded deletion/ownership pass on 2026-10-08: runtime-source inventory fell
from 39,323 to 38,086 physical lines (including comments and blanks), a net
reduction of 1,237. This inventory includes untracked source and classifies
tests, fixtures, tools, and documentation separately. Local `master` has
22,179 runtime lines, so the branch still adds 15,907; this pass does not prove
the migration is a net complexity reduction. Its substantive gains were fewer
authorities: one domain repository, one review facade, and the coordinated widget
JSON handoff. That snapshot still contained the worker-owned embed subsystem,
which the subsequent thin-client integration removes.

The pass retained accepted-review durability and legacy-account compatibility,
removed unsupported API branches rather than adding replacement abstractions,
and fixed missed notifications, delayed widget-ack ordering, registration
retry suppression, and double legacy scheduling application after ambiguous
acknowledgement. Unsupported schedulers still fail before document creation.
The server convergence test now waits for exact task/catalog head parity on
both replicas: task convergence alone is not an atomic catalog-sync boundary.
The per-task offline convergence case passed five consecutive independent runs.

Pre-thin-embed local gates: workspace build, app typecheck, lint, 425 non-backend tests,
16 server integration cases, the five-case durability/convergence subset,
actual Chrome legacy and hosted flows (including two-area peer retries in both
owner modes), Swift widget reader/writer/multiprocess handoff checks, and the
Release Simulator cold/warm, repair, and offline widget-import gate passed.
The final browser artifact builds and its exported reminder-link gate passes.
No deployment, commit, history rewrite, or new Chonk measurement occurred.

Consolidated local candidate (2026-10-09): the thin embed and direct-Repo ownership
changes are in the main source tree. Workspace build, app typecheck, lint, frozen
offline install, 430 non-backend tests (one existing skip), 16 Node server
integration cases, the five-case durability/convergence subset, actual Chrome
legacy and hosted flows, production web export, and exported reminder-link
fallback passed locally. The browser gate includes single-click focus/reveal,
offline failure/online retry with exactly one stored review, image upload,
existing-account preservation, CRUD, and immediate cold reopening after catalog
rollover. The Release Simulator gate passed cold working-set loading, real
Reveal/Remembered interactions, remote convergence, catalog repair, and offline
widget-review import/acknowledgement against independently reopened Repo files.
It was rerun after clean Expo/Pods regeneration removed old-widget build wiring,
with dependency pins unchanged. Swift checks passed current JSON reads/writes,
independent-process races, interruption/replay, and selective acknowledgement.
No UI fixture branches or production account writes were used.

The exported embed route does not load the Automerge/Wasm chunk; ordinary
`/review` still uses it. The shared Expo/auth/UI entry bundle remains substantial,
so the thin-client change is not a claim that the whole web artifact is small.
The thin embed removed roughly 2,000 net runtime lines. The subsequent direct-Repo,
shared-server ownership, quota-queue, and old-format deletion pass removed another
652, from 36,154 to 35,502 physical runtime lines, including untracked source.
Local `master` (`1873018d`) has 22,179; the branch still adds 13,323 runtime lines,
excluding tests, tools, and docs. No deployment, commit, or new Chonk measurement
occurred.

Final bounded ownership/enrollment pass (2026-10-09): the database opens directly,
the native document adapter owns its subscriptions, and hosted opening carries
one registry entry. Unused repository APIs and forwarding wrappers are gone.
Explicit, one-account reminder enrollment is separate from routine startup;
malformed optional mail configuration does not take down sync, while a corrupt
reminder database still fails. Workspace build, app typecheck, lint, 434
non-backend unit tests (one existing skip), 20 real-server integration cases,
the five-case durability/convergence subset, actual Chrome legacy/hosted flows,
production web export, and exported reminder-link fallback passed. The Release Simulator
gate passed real review controls, cold working-set fetch, warm remote updates,
pre-connection catalog repair, and independently verified offline widget import.
Runtime inventory fell another 161 lines, from 35,502 to 35,341; the branch still
adds 13,162 runtime lines over local `master`. Android's legacy behavior was not
changed. No deployment, live enrollment, commit, or Chonk measurement occurred.

## Community Repo Swift patch evaluation (2026-10-09)

Tested [the community fix for failed peerless fetches](https://github.com/holosinc/automerge-repo-swift/commit/f0d70f05f38f4047dda34cb5124c49c0d406319a)
against Orbit's pinned upstream `0.3.2` (`cdeb8053c3aa2510189429d717ab09e70f134716`).
The source and added test matched the exact commit; temporary checkouts kept
Orbit's dependency pin and runtime source unchanged.

- The added regression assertion fails on baseline and passes with the patch.
  Both focused `RepoFindTest` cases pass with the patch.
- Existing `testFind_nonsharing` and `testFindFail` pass on baseline but crash
  under the patch's debug assertions. A peer's unavailable response already
  transitions the handle; the new catch transitions it again, violating
  `markDocUnavailable`'s requirement that the handle still be requesting.
- A failed peerless lookup still cannot be retried after connecting to a peer
  that serves documents only on request. A fresh URL fetch succeeds, but the
  previously attempted URL remains unavailable without sending a new request.
- The original baseline suite completed 41 tests: 40 passed and one existing
  `testFind_sharing` observer timeout failed. That timeout is not evidence of a
  patch regression; the deterministic assertion failures above are.
- The patched Release Simulator gate passed cold fetching from a 10,867-entry
  catalog, real review controls, warm convergence, remote-only catalog conflict
  repair, and independently verified offline widget import. Orbit's
  connect-before-remote-fetch guard remained intact throughout this gate.

Do not adopt this patch as-is or remove the guard on this evidence. The fix is
useful evidence for [upstream issue #126](https://github.com/automerge/automerge-repo-swift/issues/126),
but its new repeated-unavailable transition needs correction. Explicit retry
remains a separate limitation that prevents removing Orbit's fetch-order guard.
It also does not address the separate local-handle discovery/reconnect behavior.
No Chonk testing or deployment occurred in this experiment.

## Final review candidate (2026-10-09)

The bounded final cleanup removed unused attachment-head output, binary-store
listeners, catalog component ordering, widget render scheduling fields, and a
test-only coordinator API. Attachment verification remains shared and checks
the decoded bytes, hash, length, and MIME type. Current catalogs containing an
extra obsolete component field remain readable without a migration.

Admission regressions first reproduced stalled native token verification and
account lookup exceeding the configured deadline. Browser late results also
double-counted rejection. Both admission forms now share deadline/cleanup
handling; late completion cannot attach closed sockets. Normal native header
authentication and eager Repo `join` are unchanged.

Checks on the final runtime source passed:

- Workspace build, app typecheck, lint, and frozen offline install.
- 439 non-backend unit tests, with one existing skip; 94 emulator-backed
  backend tests with mocked email.
- All 32 real-server integration cases (including nested admission cases and
  their parent tests), plus the five-case durability/convergence subset.
- Actual Chrome legacy and hosted flows: normal review UI, page-memory
  anonymous reload/retry/relay, new/existing-account submission, independent
  store and attachment verification, CRUD, and immediate cold reopening after
  catalog rollover.
- Production web export and actual Chrome exported reminder-link fallback and
  stable URL cleanup.
- Release Simulator cold working-set fetch, warm remote convergence,
  pre-connection remote-only catalog repair, and offline widget review
  import/acknowledgement verified by an independent reader.
- Swift reader/writer and cross-process JSON handoff tests: races, eight
  interrupted writes, crash replay, selective account acknowledgement, and
  malformed-journal preservation.
- Actual Home Screen WidgetKit gates on the same Release Simulator build:
  Reveal remained on each prompt, two reviews advanced to the third prompt
  with matching outbox records, Constitution/About Face Markdown used the
  available space, and a Markdown link rendered its underlined label without
  raw URL or Markdown syntax.

The Simulator used the clean pinned upstream Repo Swift `0.3.2` checkout
(`cdeb8053c3aa2510189429d717ab09e70f134716`), not the temporary community patch.
No deployed image, released build, live account, or Chonk data changed.

A consistent final inventory counts physical TS/JS/Swift runtime lines,
including comments and blanks, and separates tests, scripts/fixtures, operator
tools, and documentation. Local `master` has 22,235 runtime lines; the
pre-final-review snapshot has 35,447; this candidate has 35,333. The bounded
pass removes 114 runtime lines and leaves a net addition of 13,098 over local
`master`. Earlier dated figures used a slightly different classification and
remain historical measurements, not directly comparable totals.

The final source is preserved on `codex/automerge-final-candidate-20261009`.
The linear reconstruction uses only baseline-to-final file changes, omitting
discarded branch-only implementations. Its final Git tree must match that
candidate exactly, and the working tree must be clean. Local `master` and
`codex/automerge-pre-final-review-20261009` remain intact. This is a review
history operation, not a deployment or proof that every intermediate commit
passed the full suite.
