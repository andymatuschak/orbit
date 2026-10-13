# Orbit Lab architecture

Lab is one private vault used by Andy's phone, browser, and widget. Public Orbit
is not a runtime dependency. The fork removes account migration, Firebase auth,
reminders, embeds, legacy stores, analytics, and remote deployment machinery.
Historical public migration code and receipts remain on
`codex/automerge-phase-3-native`.

## Ownership

Automerge Repo owns document handles, merging, peer sync, and persistence
bookkeeping. Orbit's shared repository expresses task mutations, scheduling,
review selection, and repair of its derived catalog. The server does not
calculate review queues or apply HTTP reviews.

| Client/process | Repo runtime | Persistent data                     |
| -------------- | ------------ | ----------------------------------- |
| Browser        | Repo JS      | Official Repo IndexedDB adapter     |
| iOS app        | Repo Swift   | Ordinary snapshot/incremental files |
| Laptop server  | Repo JS      | Atomic Node filesystem adapter      |
| Widget         | No Repo      | One coordinated JSON queue/outbox   |

The tiny root names catalog generations and attachments. The selected catalog
has one derived entry per task; each task document contains its authoritative
definition and scheduling observations. Reviews save the task first, then its
catalog entry. Stale/conflicting entries are regenerated from task heads;
different task-document URLs use Automerge's deterministic visible value, not a
wall-clock comparison. Concurrent clients still need this repair policy even
though there is only one user.

The catalog is the index; there is no second SQL/IndexedDB review index or launch
frontier. [Per-task layout/repair](per-task-vault-v2.md#write-and-repair-rule),
[catalog rollover](catalog-rollover.md), and
[historical benchmark evidence](benchmarks/catalog-index-results.md) explain
these retained choices. Old public-release results do not establish Lab acceptance.

## Private connection

The laptop runs one Repo against one configured root and persistent directory.
It binds to `127.0.0.1`; Tailscale Serve supplies private HTTPS/WSS. Configuration
defaults to `~/Library/Application Support/Orbit Lab/config.json`, outside Git,
and includes absolute `storageRoot`/`updatesRoot`, `rootDocumentURL`, a private
`pairingToken`, an exact browser-origin allowlist, and a port (default 8787).
Startup validates the existing root and refuses missing data. A PID lock rejects
overlapping writers; shutdown drains and flushes before releasing it.

First pairing uses `POST /v1/root` with a Bearer key and caches the returned root.
The phone sends that same key in the WebSocket upgrade header. Browser
WebSockets send a bounded admission frame before ordinary Repo bytes. There is
no Firebase token refresh, ticket store, account database, provisioning process,
or service fallback.

The client stores only one explicit Lab connection and fresh local store ID;
public Orbit's registry is ignored. Cached startup does not call bootstrap or
wait for sync. Readable local prompts form a useful partial queue while missing
documents fetch in the background. With no cached prompts, opening needs the
laptop or reports unavailable data rather than pretending the queue is empty.
The shared session reconciles remote reviews and unseen queue changes.

## Widget and code updates

The widget's JSON queue is disposable. Its outbox is durable until the app
imports stable review IDs into Repo and selectively acknowledges them together
with a fresh queue. `NSFileCoordinator` and atomic replacement protect
cross-process updates; no vault or network operation runs under that lock.
The same implementation is compiled into both processes.

Application code has separate persistence. An optimized native binary embeds a
complete JavaScript bundle/assets; `expo-updates` owns downloaded code, integrity
checks, and native-runtime selection. The private server only serves immutable
iOS checkpoints and protocol-1 manifests, publishing the pointer after a complete
export. Startup launches cached code with zero network wait. A background check
does not force reload; the explicit menu action asks first.

The update endpoint distributes executable code and relies on loopback/Tailscale
privacy, not the vault pairing key (Expo asset requests may omit manifest auth).
Never expose it publicly or bake credentials into update URLs/bundles. Native
changes require a new binary/runtime; JavaScript checkpoints must match that
runtime. Data compatibility is separate: snapshot before schema experiments.

## Data isolation and operational limits

One-time capture/import preserves task and observation IDs, but creates a fresh
Lab vault and document URLs. No live bridge remains. Subsequent export/import is
an explicit offline operation. Snapshots include private configuration and Repo
files, not code checkpoints; restore creates new storage rather than overwriting
the active writer. Old phone data is preserved before replacement, not converted
by a permanent app compatibility reader.

Laptop unavailability prevents sync and uncached fetches, not cached reviews or
offline native launch. There is no reminder service, automatic cloud migration,
or server document-GC policy in this fork. The existing cloud dogfood service is
not retired merely because these local pieces build. Current proof boundaries
are in [the validation record](automerge-validation-record.md).
