# Reviewing Orbit Lab

The personal branch starts from the preserved Automerge migration, then removes
public-product responsibilities rather than carrying a Lab mode beside them.
Review the final responsibilities below; the historical debugging/deployment
timeline remains on `codex/automerge-phase-3-native` and is not part of the Lab
reading path. [The architecture](automerge-architecture.md) is the short overview.

## Reading order

1. **Domain and scheduling.** [Vault mutations](../packages/core/src/vault/mutations.ts) define observations,
   mutation types, attachment integrity, and projections through the existing
   scheduler. `OrbitVault` is an import/in-memory representation, not another
   persistent database.
2. **Shared per-task repository.** [PerTaskRepository](../packages/store-shared/src/perTaskRepository.ts),
   `perTaskCodec.ts`, and `taskMutationPlanner.ts` own task-first writes,
   catalog selection/repair, and review queries. The catalog is replaceable;
   task histories are authoritative. Read the retained
   [rollover tradeoff](catalog-rollover.md#accepted-handoff-risk) beside it.
3. **Repo access.** [Repo JS documents](../packages/store-automerge/src/repoPerTaskDocuments.ts) and
   [native documents](../packages/app/src/vault/nativePerTaskDocuments.ts) adapt Repo-owned handles
   to that repository. Binary access exists for capture/import and independent
   fixtures, not a second live persistence path.
4. **Single-user server.** [LabSyncService](../packages/automerge-sync-server/src/server.ts),
   `auth/pairing.ts`, `network/authenticatedWebSocketRouter.ts`, and `storage`
   provide one paired Repo, bounded admission, and durable ordinary files.
   Missing root data and overlapping writers are explicit errors.
5. **Local-first client.** [Lab connection](../packages/app/src/vault/labConnection.ts), the native/web opening
   functions, [review database](../packages/app/src/sync/HostedReviewDatabase.ts), and `reviewSessionManager.ts`
   share cache selection, queue reconciliation, and durable review boundaries.
   Existing `Hosted*` names do not imply account routing or public services.
6. **Native/widget boundary.** [Native module](../packages/app/modules/orbit-automerge/ios/OrbitAutomergeModule.swift) exposes generic
   document operations through Expo. [WidgetProjectionStore](../packages/app/modules/orbit-automerge/ios/WidgetProjectionStore.swift),
   `WidgetProjectionCoordinator.ts`, and `targets/widgets` implement the one-file
   handoff. Swift does not duplicate task scheduling or catalog policy.
7. **Code updates.** [App configuration](../packages/app/app.config.js), server `src/updates`,
   `scripts/lab_checkpoint.ts`, and `useAppUpdateMenuItem.native.ts` use Expo's
   device-side loader/cache with a private iOS-only manifest/asset adapter.
   Code reload is explicit or on the next cold launch, never forced mid-review.
8. **Private tools.** [Seed/export](../packages/automerge-sync-server/scripts/labSeed.ts) and [snapshot/restore](../packages/automerge-sync-server/scripts/labSnapshot.ts) capture/validate/import
   and snapshot/restore isolated directories. These are offline operations,
   not migration or sync services. Root `lab:*` scripts provide the daily loop.
9. **Bear ingestion.** [The existing reconciler](../packages/ingester/src/ingest.ts)
   takes task definitions and produces shared mutations. Its CLI is an ordinary
   paired Repo client; [the Markdown interpreter](../packages/interpreter/Readme.md)
   has no persistence or Lab-specific policy. No legacy event store is restored.

## Focused gates

```sh
bun run build
bun run lint
bun run test
bun run test:integration
```

The real server integration suite covers private pairing, both socket admission
forms, two-client disconnect/reconnect persistence, restart, and single-writer
refusal. Update protocol tests cover manifests/assets, matching runtime
selection, interrupted/incomplete exports, and immutable files. These tests do
not prove Expo's native downloaded-update launch path.
The importer suite also verifies independent-peer visibility, concurrent reviews,
quiesced server persistence, cold no-op repeats, and nonzero CLI failures.

The app tests retain native fetch/admission ordering, queue merge notifications,
offline cached reopening, and widget import/ack races. Actual Release Simulator
review and Home Screen widget controls are separate AXe/simctl gates listed in
[the app readme](../packages/app/Readme.md). Fixtures enter through ordinary
store writes, never UI-specific branches.

The final native gate must download code A, cold-launch it offline, publish/run
B without reinstalling, survive an interrupted C download, reject an incompatible
runtime, and retain offline review writes through later sync. Phone cutover also
needs signing, preserved old review data, and real Chonk/Chrome/widget acceptance.
Neither is implied by passing unit tests or a successful native build.

See [the validation record](automerge-validation-record.md) for dated outcomes.
Benchmark figures describe their historical runtime/corpus, not today's Lab
launch latency. The dogfood cloud deployment is retired; its verified recovery
material and the remaining private device gates are recorded in the ledger.
