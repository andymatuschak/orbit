# Ingestion

`ingestSources(sources, existingTasks)` is the original Orbit source/item
reconciler, now returning `VaultMutation[]`. It has no Lab configuration,
network, or storage dependency. The caller supplies current task definitions
and applies the resulting mutations through the shared repository.
`planIngestion` also returns each source/item's selected TaskID for source
writeback, including unchanged tasks and history-preserving moves.

Each supplied source is a complete snapshot of that note. Missing items are
deleted; omitted sources are left alone, except when a prompt explicitly names
an existing TaskID to move it into a supplied source.

Unstamped items retain their content-hash matching policy: edited content creates
a new task, an unambiguous move between supplied sources preserves history, and
deleted/re-added content creates a new task. Identical prompts in separate notes
are separate tasks, not one global content-hash slot.

An item can also supply `taskID`, binding it to that actual task across sources.
The Markdown interpreter emits this from a trailing `[☉](orbit://task/ID)` badge
and uses the same ID as the item's `identifier`. Existing tasks update their spec,
provenance, and ingestion metadata in place without rewriting observations or
creation time. Explicitly naming a deleted task restores it with its history; an
unknown ID creates a new task with that ID. Importing stamped Markdown into an
empty vault can therefore reuse task IDs without sharing documents or reviews.

Duplicate task claims and incompatible component changes reject the mutation plan
before application. This is not fuzzy matching or an alias registry: a badge with
a different valid ID really requests a different task. First adoption should use
the existing task's ID, not a freshly generated replacement. Once adopted, removing
the badge deliberately returns that prompt to new/content-hash identity.

Cloze-to-cloze edits can add, remove, or reorder blanks. Histories follow their
component IDs, not display order; removed components' observations remain stored
and become active again if their ID returns. New IDs start unreviewed. The
interpreter's [optional cloze prefixes](../interpreter/Readme.md#cloze-identities)
let source edits retain those IDs without labeling every blank by default.

## Private command

From the checkout root, after building:

```sh
bun run lab:ingest <ingestible.json> --dry-run
bun run lab:ingest <ingestible.json>
```

The Bun CLI does not depend on an interactive Node/fnm PATH. It reads the same
private configuration as the local server:
`--config <path>`, `ORBIT_LAB_CONFIG`, or the normal Orbit Lab application-data
path. It connects to the running loopback service as an ordinary paired Repo
client. Its `ingester-repo` cache is beside the configuration, never inside the
server's live Repo directory. This restores no Firebase connection, legacy
event upload, migration journal, or HTTP ingestion service.

The importer currently scans the vault's task definitions to match note/item
identities. Its first run downloads those task documents; subsequent runs reuse
the Repo cache and synchronize them before reconciling. Reads use 64-document
batches, flushing and releasing listeners/Repo handles between them. Only task
definitions are retained, not every task's live Automerge history. This is an
operator inventory, not the app's startup path; it adds no source index.

`--dry-run` computes the plan without applying ingestion mutations. Normal Repo
sync and catalog conflict repair can still run. `--report <new-file>` writes the
plan, including private note content, with mode 0600 and refuses to overwrite
an existing file. Standard output contains only mutation counts. Failures exit
nonzero; unsuccessful deliveries retain the local client cache for a retry.
The command waits for the server's reported heads to match its writes. This is
sync confirmation, not a separate server disk-fsync receipt. The programmatic
`runIngest` result and completed private reports include task assignments; CLI
stdout remains counts-only. Reports are reserved before applying and completed
after sync; a failed run can leave an empty report, not a successful receipt.

[Markdown preparation](../interpreter/Readme.md#prepare-disposable-stamps) uses a
dry-run plan's assignments to add missing badges to disposable copies. After the
source owner accepts them, [Markdown import](../interpreter/Readme.md#import-source-snapshots)
reads the accepted exports. Neither importer writes source files; source-system
save checks and scheduling belong to the caller, not this package.

Unit tests preserve the original matching/provenance cases. The isolated Node
integration tests run real paired Repo clients and inspect quiesced server files
to prove new-document delivery, no-op cold repeats, concurrent review preservation,
CLI failure status, and bounded document-fetch cancellation without touching
the personal vault.
