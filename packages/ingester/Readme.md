# Ingestion

`ingestSources(sources, existingTasks)` is the original Orbit source/item
reconciler, now returning `VaultMutation[]`. It has no Lab configuration,
network, or storage dependency. The caller supplies current task definitions
and applies the resulting mutations through the shared repository.

Each supplied source is a complete snapshot of that note. Missing items are
deleted; omitted sources are left alone. The existing content-hash identity
policy is unchanged: edited content creates a new task, while an unambiguous
move between supplied sources preserves the task ID and review history.
Deleted/re-added content creates a new task. Identical prompts in separate
notes are kept separate rather than overwriting a global content-hash slot.

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
sync confirmation, not a separate server disk-fsync receipt.

Unit tests preserve the original matching/provenance cases. The isolated Node
integration tests run real paired Repo clients and inspect quiesced server files
to prove new-document delivery, no-op cold repeats, concurrent review preservation,
CLI failure status, and bounded document-fetch cancellation without touching
the personal vault.
