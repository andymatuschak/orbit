# Per-task Automerge vault

This is Lab's only live vault layout. Public migration incidents and retired
format support are preserved on `codex/automerge-phase-3-native`; this note
describes the retained data semantics, not a migration workflow.

## Layout and launch

```text
private selection → generation root → selected catalog → selected task documents
                                             └───────→ every other task URL
```

- The root stores vault metadata, attachment references, and immutable catalog
  generation descriptors.
- The catalog has one packed derived entry per task: its document URL,
  `nextDueTimestampMillis`, `isDeleted`, and `indexedTaskHeads`.
- Each task document is authoritative for its definition and scheduling
  observations. Attachment bytes live in separate referenced documents.

The catalog is the review index. There is no second SQL/IndexedDB index or
frontier, and the app does not read the widget queue for launch. Web IndexedDB
stores Repo bytes; iOS uses ordinary files. Launch reads the root/catalog and
selected task working set instead of projecting the whole vault.

## Write and repair rule

1. Durably save the authoritative task document.
2. Derive its entry from the resulting task heads.
3. Durably save that catalog projection.

A crash after step 1 leaves a stale index, not a falsely committed task.
Selected task reads repair head mismatches; `repairCatalog()` is an explicit
full audit. Concurrent task histories merge normally. A conflicting derived
entry is regenerated from the merged task. When two entries name different
task URLs, use Automerge's deterministic visible value, validate the selected
task identity, and reproject it; this is not wall-clock last-write-wins. An
unselected task document can become orphaned.

The shared `PerTaskRepository` owns decoding, ranking, mutations, and repair
policy for both platforms. Repo JS/Swift adapters supply document operations
and conflict metadata; Swift does not implement a second scheduler/schema.
Present malformed or authoritative-conflicted documents produce errors rather
than empty queues. A readable partial cache remains useful while missing tasks
fetch; with no usable prompt available, queries wait for the missing data or fail.
Explicit task/full-vault reads remain strict.

Native remote-only fetches wait for Repo peer admission before calling `find`.
Local reads do not. Repo Swift's `documentIds()` includes unresolved requests,
so availability checks use resolved observed handles or ordinary files.
Connection priming opens only those local documents and keeps reconnect sync
separate from review startup.

## Bounded catalog history

`rolloverCatalog()` reads every authoritative task named by the current catalog,
builds a fresh derived document, saves it, then announces an immutable descriptor
in the root. Readers choose the newest valid available generation and fall back
while a newer catalog is missing. Replacement is explicit maintenance, never an
automatic reconstruction loop or content manufactured at a missing URL.

Offline task writes merge and repair into the selected generation; obsolete
catalogs are not merged into the new one. See [the rollover protocol](catalog-rollover.md)
for lineage, concurrency, and the accepted narrow orphan-task risk. Clients do
not delete old generations; server collection is not implemented.

Tests in `store-automerge` cover task-before-catalog persistence failure,
independent offline writes, derived-entry conflicts, lineage, missing-generation
fallback, incomplete reconstruction, and the accepted orphan case. The
[benchmark record](benchmarks/catalog-index-results.md) retains measured reasons
for the layout. Current Lab acceptance is tracked separately in
[the validation record](automerge-validation-record.md).
