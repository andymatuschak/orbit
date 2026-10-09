# Reviewing the Automerge branch

This is an experiment for Andy's account, not a migration of all Orbit users.
The review history starts at local `master` (`1873018d`), including its unpushed
prerequisites, and presents the final implementation of each responsibility.
Simplifications are folded into those commits; discarded prototypes and
successive recovery patches are not part of the reading path.

The nine commits cover toolchain prerequisites, shared domain/storage, hosted
runtime/auth/reminders, operator migration, native/widget foundations, client
integration/thin embeds, end-to-end gates, release/deployment, and this review
record. Intermediate commits introduce dependencies in that order; the full
regression results below apply to the completed tree, not every intermediate
commit. Release hooks become usable after the release-workflow commit.

Start with [the architecture](automerge-architecture.md). Offline reviews,
cross-client convergence, and faster local launch are demonstrated benefits.
The remaining catalog policy, native bridge, authenticated server, and widget
handoff are still Orbit-owned code. This experiment is not yet a demonstrated
net reduction in complexity.

## Code reading order

1. **Domain mutations and scheduling.** `packages/core/src/vault` defines task
   observations, attachment integrity, and projection through Orbit's existing
   scheduler. `OrbitVault` is an in-memory input, not another persisted database.
2. **One shared repository.** `packages/store-shared/src/perTaskRepository.ts`,
   `perTaskCodec.ts`, and `taskMutationPlanner.ts` own the root/catalog/task
   layout, queue, mutations, and derived-entry repair. Read
   [the per-task layout](per-task-vault-v2.md) and
   [catalog replacement](catalog-rollover.md) beside them. Task documents are
   authoritative; the replaceable catalog is the review index.
3. **Repo access.** `packages/store-automerge/src/repoPerTaskDocuments.ts` and
   `packages/app/src/vault/nativePerTaskDocuments.ts` adapt Repo JS and Repo
   Swift to that same repository. Normal operations change Repo-owned handles;
   byte-backed access is confined to import tools and independent fixtures.
4. **Hosted sync.** `packages/automerge-sync-server/src/server.ts`, `network`,
   `repo`, and `storage` own account admission, bounded Repo lifetimes, and
   atomic ordinary-file persistence. WebSocket data uses the ordinary Repo
   protocol. Firebase tokens are verified directly; there is no ticket store.
5. **Native platform boundary.** `packages/app/modules/orbit-automerge/ios`
   contains the generic Expo bridge and ordinary-file Repo Swift provider.
   Swift does not reimplement Orbit scheduling or catalog policy.
6. **Local-first review.** `HostedReviewDatabase.ts`, `hostedReviewOpening.ts`,
   the web/native opening functions, and `reviewSessionManager.ts` open the
   selected local vault, synchronize in the background, and share queue
   subscriptions, durable reviews, attachment URL lifetime, and closure.
7. **Thin embeds.** `EmbeddedReviewSession.ts`, `embeddedReviewAPI.ts`,
   `embeddedHostBridge.ts`, and `packages/web-component` keep anonymous
   progress in publisher/iframe page memory. Signed-in reviews are online-only
   HTTP operations against the account's existing server Repo; unmigrated
   accounts use a small legacy transport. Neither path creates an embed Repo,
   durable journal, worker, or owner-election lifecycle.
8. **Widget handoff.** `WidgetProjectionCoordinator.ts`,
   `WidgetProjectionStore.swift`, and `packages/app/targets/widgets` share one
   coordinated JSON queue/outbox. The app imports pending review IDs durably
   before acknowledging them; the widget does not join the app's live Repo.
9. **Reminders.** The server's `notifications` directory uses the catalog's due
   timestamps, root preferences, and a small SQLite delivery/deadline index.
   There is one notifier loop, conservative backoff, and no distributed leases
   or email reconciliation service.
10. **Operator tools last.** `migrateAccount.ts` and `migration` freeze, import,
    audit, and export one account. They are not an extra live sync mechanism.
    Enrollment and deployment commands live in
    `packages/automerge-sync-server/deploy`.

## Deliberate limits

- Android and unmigrated accounts retain the legacy store/API/notifier. Removing
  them is a broader rollout, not cleanup of this account's experiment.
- Only the current schema-2 root, catalog, and task layout is supported.
  Attachment, scheduler, account-control, and audit formats have their own
  versions; version 1 there does not imply an old vault reader.
- A new task can become undiscoverable if its document survives, every catalog
  naming it is lost, and its creator disappears. This is the accepted narrow
  handoff risk, not a hidden second task registry. Catalog rollover does not
  prune task history or collect every old generation.
- Native transport ordering, connection priming, and same-document import
  compensate for verified upstream Repo Swift behavior. The tested community
  patch was not adopted; [the experiment record](automerge-validation-record.md)
  distinguishes its regression from the remaining explicit-retry limitation.
- Anonymous embed progress disappears on page reload. Signed-in marks advance
  after acknowledgement and retain a stable ID for an ambiguous same-page
  retry. Account state refreshes on viewport entry or page/iframe focus, not
  through another live subscription. Release the updated publisher component
  with the embed app for page-wide anonymous relay.
- Widget writes use coordinated atomic replacement, selective acknowledgement,
  and file/directory persistence barriers. Tests interrupt processes; they do
  not prove behavior under physical power loss or before first unlock.
  Earlier SQLite handoffs and anonymous journals have no converter or drain.
- Expo's temporary scene-template adapter remains necessary. Its upstream
  removal trigger is recorded beside the adapter.
- Reminder enrollment is an explicit one-account command with the sync writer
  stopped. Restarts resume the saved index. Delivery is best effort: record the
  attempt before sending and do not retry an ambiguous result that day.

## Regression gates

Run from the repository root with local dependencies installed:

```sh
bun run build
node node_modules/@typescript/native/bin/tsc --noEmit -p packages/app/tsconfig.json
bun run lint
bun run test:unit
bun --cwd packages/automerge-sync-server test:integration
bun --cwd packages/automerge-sync-server test:durability-convergence
```

Backend tests use local Firebase emulators; mail is mocked. Start the emulators
in ordinary legacy mode for `smoke:web`, and with
`ORBIT_AUTOMERGE_NEW_ACCOUNTS=true` for `smoke:web:hosted`. These use actual
Chrome, store-seeded data, and normal product UI paths. After `build:web`, run
`smoke:web:review-links:exported` too: exported lazy-route registration differs
from the development server.

```sh
bun --cwd packages/app smoke:web
bun --cwd packages/app smoke:web:hosted
ORBIT_IOS_CONFIGURATION=Release ORBIT_SIMULATOR_UDID=<dedicated-test-simulator> \
  bun --cwd packages/app ios:hosted-fetch-smoke
```

The hosted gates cover cold working-set fetch, real Reveal/Remembered controls,
remote convergence, catalog conflict repair and cold reopening after rollover.
The native gate independently verifies offline widget import and acknowledgement.
Neither requires Chonk, real credentials, UI fixture branches, or live writes.
Widget reader/writer, cross-process durability, layout, and link gates are in
`packages/app/Readme.md`.

Dated results and candidate boundaries are in
[the validation record](automerge-validation-record.md); deployment receipts and
rollout gates remain in `packages/automerge-sync-server/deploy`. Recovery source
and history are retained on `codex/automerge-pre-final-review-20261009`; rewriting
does not change the deployed bytes or released-build identities.
