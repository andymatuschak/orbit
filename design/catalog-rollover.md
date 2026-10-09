# Catalog generation rollover protocol

This is the accepted protocol for the current per-task store, not a second
implementation. Regression cases live in
`packages/store-automerge/src/__tests__/perTaskVault.test.ts`.

## Purpose

Bound the Automerge history of Orbit's review index without inventing general
CRDT history pruning. Catalogs are disposable projections; task documents and
their scheduling observations remain authoritative.

## Documents

### Root

The root is a small, long-lived Automerge document containing immutable catalog
descriptors. It deliberately does not duplicate the catalog's task-document
URLs. Each descriptor records:

- generation number
- catalog document URL
- predecessor catalog URL
- the catalog's heads at initial publication

The preferred descriptor is the candidate with the highest generation, breaking
a same-generation tie by document URL. A device uses the newest preferred
candidate it can actually load and validate. Keeping candidates in a map avoids
a conflicted last-writer-wins pointer. The root grows by one small entry per
infrequent rollover, not per task or review.

### Catalog generation

A catalog generation is a fresh Automerge document with one derived entry per
task. Each entry includes the task document URL, its next due component, and the
task heads used to produce that projection.

### Task documents

Task documents are authoritative. Reviews append scheduling observations to the
task document. A catalog entry whose recorded heads differ from its task's heads
is stale and can be deterministically repaired.

## Rollover sequence

1. Read the current catalog and synchronize every authoritative task document
   it names.
2. Build generation `N + 1` from their current state, naming generation `N` as
   its predecessor.
3. Persist the new catalog locally so Repo can begin synchronizing it.
4. Add its immutable descriptor to the root.
5. Clients following the root use the newest candidate they can load and
   validate, falling back while a newer document is still arriving.
6. Continue repairing entries as later task changes arrive.
7. If the newest candidate remains unavailable, explicit operator maintenance
   can create a successor from the newest available fallback, after loading
   every authoritative task it names. Clients do not reconstruct automatically.
8. Retain previous generations. Server collection is not implemented yet.

Repo does not need to make the catalog and descriptor visible atomically. The
fallback rule tolerates either synchronization order. An explicit replacement
can restore progress if the creating device disappears; until then clients
continue with the available generation. The narrow orphan risk below remains.

## Crash behavior

- Before step 3: there is no new candidate and the old generation remains
  preferred.
- Between steps 3 and 4: the new catalog is an unreferenced, collectible orphan.
- If the descriptor synchronizes before the catalog, other devices continue
  using the newest older generation they can load.
- If the creating device disappears before sharing the catalog, clients keep
  the available fallback; an operator can publish a successor built from it.
- During later repair: ordinary Automerge synchronization converges the catalog.

The initial heads in the descriptor are a lineage checkpoint, not a permanent
version pin. A repaired catalog is valid when it still contains those heads; an
unrelated replacement at the same URL is rejected.

## Offline and concurrent clients

An offline client may review tasks and update an obsolete catalog. On reconnect:

1. Its authoritative task changes merge normally.
2. It learns the latest catalog generation from the root.
3. It stops writing the obsolete catalog.
4. The task-head mismatch repairs the active catalog.

The obsolete catalog itself is never merged into the new generation. Concurrent
task changes remain ordinary Automerge changes; after their task document
converges, its possibly multiple heads become the heads recorded by the repaired
catalog entry.

Concurrent rollovers can create two candidates for the same generation. Every
peer chooses the same candidate using the document-URL tie-break. The losing
catalog is a collectible orphan. Because catalogs contain only derived state,
task-head repair brings the winner current.

A device never attempts to manufacture new content at a missing Automerge URL.
It creates a successor with a new URL and records the missing candidate as its
predecessor. Reusing the missing URL would falsely claim the replacement had the
missing document's Automerge identity and causal history.

Reconstruction fails closed until every task named by the fallback catalog is
locally available. It does not add locally known tasks absent from that catalog;
doing so would make independently reconstructed candidates depend on accidental
local knowledge.

## Accepted handoff risk

Orbit deliberately does not keep a second registry of task-document URLs. This
accepts one narrow failure: a newly created task document reaches durable
storage, every catalog generation referencing it fails to reach durable
storage, and the creating device disappears permanently. A replacement rebuilt
from the previous catalog cannot discover that orphan document.

The straightforward registry map costs about 178 KB, 33 ms of fresh-process
desktop load time, and 27 MiB of materialized RSS for the 10,867-task dogfood
shape. Kept in the launch root, it increases root-plus-fresh-catalog desktop load
from roughly 76 ms to 103 ms. A separate cold registry avoids normal launch cost
but introduces another document and protocol. Packed encodings were rejected
because rewriting them on task creation recreates the same history-growth
problem this rollover is intended to solve.

This is an explicit simplicity and launch-performance tradeoff, not an
accidental gap. Ordinary delayed synchronization remains safe: if the missing
catalog later arrives, it wins over the fallback and its task references can be
reconciled. The risk affects task creation during a failed handoff, not reviews
of tasks already named by the fallback catalog.

Revisit this decision if Automerge Repo gains a cheap authoritative document
inventory, server-side document discovery, or a durable publication primitive
that can prove a new catalog reached storage before its descriptor is announced.
Any of those would close the gap without a duplicate launch-path index. Until
then, the recovery test preserves the accepted behavior explicitly.

## What this does not solve

- It does not prune history while preserving an Automerge document identity.
- It does not yet define the server's conservative garbage-collection window.
- Physical-iPhone measurements are recorded separately in
  [the benchmark evidence](benchmarks/catalog-index-results.md).
- It assumes clients understand generations before old catalogs are collected.

These limits are intentional: a replaceable derived index lets Orbit avoid
owning a general compaction system.
