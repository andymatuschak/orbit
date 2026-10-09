# Catalog-as-index results

Historical evidence: these measurements informed the adopted schema. The duplicate
prototype harness has been retired; current regression gates exercise the real
store and clients. Its original source remains at the recovery tag
`automerge-dogfood-pre-review-20261006:prototypes/catalog-index`.

Measured on the September 2026 dogfood vault using Bun 1.4.2 and Automerge
3.4.1 on an M1 Max Mac. These are desktop prototype measurements, not physical
iPhone budgets.

## Corpus

- 10,867 live catalog entries, one per task
- 77,774 intended scheduling observations
- 30,515 obsolete unsequenced legacy observations excluded because each had a
  byte-for-byte identical sequence-preserving counterpart
- 21 observations for components no longer present in their task definition

The duplicate legacy observations are a dogfood-data repair issue, independent
of this schema experiment. The prototype did not modify the live vault.

## Result

| Catalog form                           |     Bytes | Fresh load, median | Scan 10,867 entries, median | Retained RSS delta, median |
| -------------------------------------- | --------: | -----------------: | --------------------------: | -------------------------: |
| Historical, after 77,774 index updates | 5,016,236 |             465 ms |                      4.4 ms |                    196 MiB |
| Rotated, same final 10,867 entries     |   857,558 |              70 ms |                      4.4 ms |                     54 MiB |

The reconstruction registry was measured separately with 10,867 synthetic
task-document URLs matching the proposed URL shape. Each result is the median of
five fresh processes:

| Encoding                              | Later task additions |      Bytes | Fresh load | Retained RSS delta |
| ------------------------------------- | -------------------: | ---------: | ---------: | -----------------: |
| No registry, descriptor root only     |                    0 |        391 |     6.2 ms |            2.1 MiB |
| Automerge map                         |                    0 |    178,287 |    32.7 ms |           26.9 MiB |
| Automerge map                         |                  100 |    180,654 |    41.8 ms |           27.7 MiB |
| Automerge map                         |                1,000 |    200,292 |    43.9 ms |           31.9 MiB |
| One packed immutable string           |                    0 |    184,109 |    19.3 ms |            9.6 MiB |
| One packed immutable string           |                  100 | 18,638,416 |   427.4 ms |          211.0 MiB |
| Immutable strings chunked by 256 URLs |                    0 |    184,224 |    16.5 ms |           14.5 MiB |
| Immutable strings chunked by 256 URLs |                  100 |    192,779 |    24.6 ms |           17.7 MiB |
| Immutable strings chunked by 256 URLs |                1,000 |    248,005 |    51.4 ms |           39.5 MiB |

A single packed value has the best initial materialization but is disqualified:
each task addition retains another full list in Automerge history. Chunking
delays the same effect but becomes worse than the map after 1,000 additions. The
map is the stable long-term representation.

Loading the map in the hot root raises the estimated sequential desktop path
from about 76 ms (6 ms descriptor root plus 70 ms fresh catalog) to about 103 ms
(33 ms registry root plus catalog), roughly 35%, and adds about 25 MiB of
materialized memory. A separate cold registry document would remove that cost
from normal launch, but adds another document and protocol solely for rare
reconstruction. Omitting the registry is fastest and simplest. The prototype
now makes that the explicit design choice and tests the resulting narrow
orphan-task case described in `ROLLOVER.md`. These remain desktop measurements,
not physical-iPhone budgets.

The final historical catalog exactly matched an independent projection of the
deduplicated observation history. The task-head repair predicate also correctly
accepted reordered matching heads and rejected divergent or incomplete heads.

## Native Repo Swift gate

The exact private rotated artifact was then copied temporarily into a standalone
Release iOS benchmark host using Automerge Repo Swift 0.3.2 and an ordinary-file
`StorageProvider`. Each of five samples started a new process and a new Repo,
loaded the catalog through `Repo.find`, scanned every packed entry to select the
first live task, and opened a separate representative task document. No
benchmark branch was added to Orbit's application or UI.

| Runtime               | JSON decoding       | Catalog load | Scan 10,867 entries | First task | Sequential total | Live RSS delta |
| --------------------- | ------------------- | -----------: | ------------------: | ---------: | ---------------: | -------------: |
| M1 Max macOS control  | one decoder/entry   |      22.4 ms |            113.8 ms |     0.4 ms |         136.6 ms |   not retained |
| M1 Max macOS control  | one batched decoder |      22.3 ms |            100.1 ms |     0.3 ms |         122.9 ms |   not retained |
| Release iOS Simulator | one decoder/entry   |      30.1 ms |            104.5 ms |     0.4 ms |         135.0 ms |       15.4 MiB |
| Release iOS Simulator | one batched decoder |      27.5 ms |             88.6 ms |     0.4 ms |         116.5 ms |       19.5 MiB |

The catalog's Automerge load is already small. The dominant native cost is not
Repo or opening the task document; it is crossing the Swift/Rust boundary to
read and decode 10,867 packed scalar entries. Batching JSON decoding saved only
about 18 ms on the Simulator and cost about 4 MiB more live RSS, indicating that
JSON decoder construction is not the main problem.

## Rejected launch-frontier optimization

A follow-up measured whether launch can read only the first few due entries.
The frontier is an ordered list of task IDs; all authoritative fields remain in
the existing per-task catalog entry. It is rewritten only when the actual top-K
set or order changes. The table replays the same 77,774 observations:

| Frontier entries | Frontier rewrites | Frontier history | Estimated catalog with both histories | Rotated catalog |
| ---------------: | ----------------: | ---------------: | ------------------------------------: | --------------: |
|                4 |    34,325 (44.1%) |           765 KB |                               5.78 MB |          858 KB |
|                8 |    37,655 (48.4%) |           916 KB |                               5.93 MB |          858 KB |
|               32 |    45,412 (58.4%) |          1.39 MB |                               6.40 MB |          859 KB |
|              100 |    57,810 (74.3%) |          4.41 MB |                               9.43 MB |          860 KB |

Repeating complete packed entries in the frontier was immediately rejected: at
32 entries it retained 19 MB of frontier history. Keeping only task IDs reduced
that substantially.

The optimized 32-entry artifact was measured in five fresh Release Simulator
processes through Repo Swift and ordinary-file storage:

| Catalog load | Read first catalog entry | First task | Sequential total | Live RSS delta |
| -----------: | -----------------------: | ---------: | ---------------: | -------------: |
|      27.5 ms |                   0.9 ms |    0.36 ms |          28.8 ms |       12.4 MiB |

The previous full native scan took 88.6 ms after catalog load; the frontier
reduced that portion to 0.9 ms. Orbit nevertheless rejected the optimization:
the review UI requires up to 50 due tasks, so a practical frontier would need at
least 50 entries plus stale-entry slack. Saving roughly 80 ms did not justify a
second derived ordering, its repair and concurrency cases, or its additional
history. The implementation and benchmark machinery were removed; these
numbers remain only as the decision record.

## Interpretation

The current index cardinality is inexpensive: a fresh document with one entry
per task is under 0.9 MB, loads quickly on this development Mac, and can be
scanned in a few milliseconds. The risk is Automerge history growth. Updating
the same entries for every review made the document almost six times larger and
roughly seven times slower to load, with a much larger materialized working set.

An ever-growing single catalog is therefore not a sufficient launch solution.
The design remains plausible with replaceable catalog generations to bound
history. Clients will initially scan the complete catalog on launch. Per-task
documents remain a proposed production change; the isolated real-data gate
below tests that shape without integrating it into the application.

## Real per-task-document gate

The dogfood vault was deterministically materialized as one Automerge document
per task, containing the real task definition and all observations for that
task. Two independent migrations produced byte-for-byte identical artifact
trees.

| Measure                     |       Result |
| --------------------------- | -----------: |
| Task documents              |       10,867 |
| Scheduling observations     |       77,774 |
| Migration time              |        7.4 s |
| Logical task-document bytes |     11.55 MB |
| Fresh catalog               |      0.98 MB |
| Total logical bytes         |     12.53 MB |
| APFS allocated size         |    43.75 MiB |
| Median task document        |    939 bytes |
| p95 task document           |  1,848 bytes |
| Largest task document       | 15,556 bytes |

The allocated-size multiplier is ordinary filesystem block overhead across
10,867 tiny files, not Automerge heap use. The prototype uses the same
document-directory plus `snapshot.automerge` shape as the Swift storage
provider.

Five fresh Release iOS Simulator processes loaded the real catalog through Repo
Swift, scanned all 10,867 entries, and opened the first 50 real task documents:

| Catalog load | Full scan | First task | All 50 tasks | First-task path | Live RSS delta |
| -----------: | --------: | ---------: | -----------: | --------------: | -------------: |
|      29.6 ms |   94.0 ms |    0.49 ms |      10.9 ms |        124.1 ms |       21.4 MiB |

The same signed Release harness and private fixtures were then run in five
fresh processes on an iPhone 14 Pro (Chonk):

| Catalog load | Full scan | First task | All 50 tasks | First-task path | Live RSS delta |
| -----------: | --------: | ---------: | -----------: | --------------: | -------------: |
|      25.2 ms |   81.0 ms |    0.34 ms |       9.0 ms |        106.6 ms |       28.0 MiB |

The physical-device result confirms that the full catalog scan remains well
under one tenth of a second on the current dogfood phone. Opening task documents
is not the launch bottleneck: the first document adds less than half a
millisecond, and opening all 50 adds about nine milliseconds.

Five fresh Bun/Automerge processes, as a JavaScript/Wasm control for the web
path, measured 74.5 ms catalog load, 4.9 ms scan, 2.4 ms to read and materialize
the first task, and 26.9 ms for all 50. Retained RSS increased by 62.2 MiB.
IndexedDB itself is not included in that control and remains a production-web
integration measurement.

The task-first write protocol passed deterministic tests for a crash after the
authoritative task write, idempotent catalog repair, concurrent offline task
writes, merged task heads, concurrent derived-entry conflicts, and conflict
resolution from the merged authoritative task. This validates the core
cross-document recovery rule without introducing a transaction layer.

## Rollover protocol result

The follow-up generation prototype passed deterministic tests for:

- refusing to announce a catalog that is not locally readable
- crashes before publication, between publication and announcement, and after
  announcement
- concurrent same-generation candidates resolving identically on every peer
- accepting catalog descendants while rejecting an unrelated document placed at
  the same URL
- an offline review made against the obsolete generation repairing into the
  active generation
- concurrent task writes spanning the rollover converging before index repair
- idempotent repair once catalog and task heads match
- immediate fallback when a newer descriptor arrives before its catalog
- background replacement of a persistently missing generation
- delayed arrival of the missing generation not displacing its successor
- refusing reconstruction until every task named by the fallback is available
- explicitly omitting a task referenced only by a permanently missing
  generation

This supports generation rollover as an application-level way to bound catalog
history. It does not require a cross-document transaction or remote durability
acknowledgment: clients keep using the newest valid generation available to them
and repair a missing generation in the background. The remaining production
boundary is a conservative server garbage-collection window. This is narrower
than owning general history compaction.
