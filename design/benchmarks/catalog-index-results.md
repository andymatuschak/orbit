# Historical catalog/index measurements

These September 2026 measurements motivated the retained per-task schema; they
are not today's Lab startup timings. The retired prototype is preserved at
`automerge-dogfood-pre-review-20261006:prototypes/catalog-index`. Current shared
store tests exercise the adopted persistence/repair rules.

The measured corpus had 10,867 tasks and 77,774 intended scheduling observations.
The prototype excluded 30,515 obsolete unsequenced observations with identical
sequence-preserving counterparts; it did not modify the live vault. This differs
from the complete corpus captured for Lab, so compare timings only within their
stated runtime and data boundary.

## History, not cardinality, dominates

Bun 1.4.2 / Automerge 3.4.1 on an M1 Max Mac; fresh-process medians:

| Catalog                              |     Bytes |   Load | Scan 10,867 entries | Retained RSS growth |
| ------------------------------------ | --------: | -----: | ------------------: | ------------------: |
| Historical, 77,774 index updates     | 5,016,236 | 465 ms |              4.4 ms |             196 MiB |
| Fresh generation, same final entries |   857,558 |  70 ms |              4.4 ms |              54 MiB |

The index still contains one entry per task, not per observation. Updating those
entries retains Automerge history. Rollover preserves authoritative task history
while replacing that derived document.

## Registry and frontier decisions

A 10,867-task Automerge registry map added 178,287 bytes, 32.7 ms load time, and
26.9 MiB RSS. Loading it in the root raised the estimated desktop
root-plus-catalog path from 76 ms to 103 ms. One packed immutable list initially
used less memory, but 100 additions retained 18.6 MB and 211 MiB RSS. Chunking
delayed the same growth. We chose no registry, accepting the narrow orphan risk
documented in [the rollover protocol](../catalog-rollover.md#accepted-handoff-risk).

A 32-ID launch frontier cut the Release Simulator scan from 88.6 ms to 0.9 ms
(27.5 ms catalog load, 0.36 ms first task, 12.4 MiB RSS). Replaying the history
added 1.39 MB of frontier changes. The UI needs up to 50 due tasks plus stale
entry slack, so saving roughly 80 ms did not justify another ordering, repair
policy, or history. The implementation was removed.

## Real per-task documents

Two independent prototype materializations produced identical artifact trees:

| Measure                              |                     Result |
| ------------------------------------ | -------------------------: |
| Task documents                       |                     10,867 |
| Scheduling observations              |                     77,774 |
| Materialization time                 |                      7.4 s |
| Logical task-document bytes          |                   11.55 MB |
| Fresh catalog                        |                    0.98 MB |
| Total logical bytes                  |                   12.53 MB |
| APFS allocation                      |                  43.75 MiB |
| Median / p95 / largest task document | 939 / 1,848 / 15,556 bytes |

The allocation multiplier is filesystem block overhead across tiny files, not
Automerge heap usage. Five fresh Release processes used Repo Swift 0.3.2 and
ordinary-file storage, read the full real catalog, and opened the first 50 tasks:

| Runtime               | Catalog load | Full scan | First task |  All 50 | First-task path | RSS growth |
| --------------------- | -----------: | --------: | ---------: | ------: | --------------: | ---------: |
| iOS Simulator         |      29.6 ms |   94.0 ms |    0.49 ms | 10.9 ms |        124.1 ms |   21.4 MiB |
| iPhone 14 Pro (Chonk) |      25.2 ms |   81.0 ms |    0.34 ms |  9.0 ms |        106.6 ms |   28.0 MiB |

The scan crossed the Swift/Rust boundary to read packed entries; it was not a
plain file read. A separate synthetic Simulator control reduced its scan from
104.5 ms to 88.6 ms by batching JSON decoding, at roughly 4 MiB additional RSS.
Opening the actual task documents was inexpensive relative to that scan.

A five-process JavaScript/Wasm control measured 74.5 ms catalog load, 4.9 ms scan,
2.4 ms first task, 26.9 ms first 50, and 62.2 MiB RSS growth. It did not include
IndexedDB or the application's full launch path.

## Interpretation boundary

The evidence supported a catalog index plus authoritative per-task documents and
explicit generation rollover. It did not prove the whole native app launches
in 106.6 ms or establish today's optimized Lab build timings. Native bootstrap,
JavaScript startup, UI layout, code updates, and actual device behavior are
separate measurements. See [current validation](../automerge-validation-record.md)
for those gates; public migration/incident results remain on the preserved branch.
