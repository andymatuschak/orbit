# Catalog generation rollover

Catalogs are replaceable derived indexes; task documents and scheduling
observations remain authoritative. The goal is to bound index history without
owning a general CRDT compaction system. This is the existing shared-store
protocol, not a second implementation or automatic background service.

## Selection and publication

The small long-lived root contains immutable descriptors: generation number,
catalog URL, predecessor URL, and initial publication heads. It deliberately
does not duplicate the catalog's task URLs. Descriptors live in a map rather
than a conflicted pointer. Prefer the highest generation, breaking ties by
document URL, but use only a catalog whose identity and lineage validate.
Initial heads prove lineage; they do not pin the catalog against later repairs.

An explicit `rolloverCatalog()` operation:

1. Loads every authoritative task named by the current catalog.
2. Builds and locally persists generation `N + 1` from those tasks, naming `N`
   as predecessor.
3. Announces its immutable descriptor in the root.
4. Leaves readers on the newest valid available generation while sync catches up.
5. Continues task-head repair as later task changes arrive; previous generations
   remain retained.

If the newest generation remains missing, explicit operator maintenance can
publish a successor from the available fallback only after loading all tasks it
names. Clients do not reconstruct automatically. Never place newly manufactured
content at the missing document URL: that would falsely claim its identity and
causal history.

## Failure and concurrency

- Before local publication: no new candidate; keep the old generation.
- Between publication and announcement: the new catalog is an unreferenced orphan.
- Descriptor arriving first: keep the available predecessor until the catalog arrives.
- Publisher disappearing: keep the fallback; an operator may build a successor.
- Concurrent same-generation candidates: deterministic URL ordering selects the
  same winner; the other is an orphan.
- Offline review against an obsolete catalog: merge its authoritative task
  changes, adopt the latest generation, and repair that index from merged heads.
  Do not merge the obsolete catalog into its replacement.

Incomplete reconstruction fails rather than omit unavailable tasks or add tasks
known only by accident to one device. Repo need not atomically publish the
descriptor and catalog: fallback tolerates either delivery order. A local save
is not proof the server received the new generation.

## Accepted handoff risk

There is no second authoritative task-URL registry. We accept one narrow loss
case: a newly created task reaches durable storage, every catalog referencing it
fails to reach durable storage, and its creator disappears permanently. A
replacement from the predecessor cannot discover that orphan. Reviews of tasks
already named by the predecessor do not have this risk; ordinary delayed sync
does not lose the new task if its catalog later arrives.

For the historical 10,867-task shape, a root registry map added about 178 KB,
33 ms of desktop load time, and 27 MiB of materialized RSS. A separate cold
registry avoids launch cost but adds another document/protocol. Packed-list
encodings retained rewritten lists in history. These are measured tradeoffs,
not current Lab performance budgets; see [the benchmark record](benchmarks/catalog-index-results.md).

Revisit this choice if Repo gains cheap authoritative document discovery or a
publication primitive proving remote storage. Until then, the orphan-risk test
keeps the limitation explicit.

## Limits and tests

Rollover does not prune history under an existing document identity. It does not
collect old generations or define a safe server GC window. Readers must know
the protocol before collection can become safe. Regression cases live in
`packages/store-automerge/src/__tests__/perTaskVault.test.ts`; current Lab client
and runtime acceptance remains a separate gate.
