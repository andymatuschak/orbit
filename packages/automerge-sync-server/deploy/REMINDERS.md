# Single-host reminders

Implementation: `src/notifications/`. One loop, one process, no additional
worker or Cloud Scheduler job. The existing catalog supplies due dates; the
root supplies preferences. Read [the architecture](../../../design/automerge-architecture.md)
for the deliberately weaker delivery semantics.

## Enrollment and secrets

The notifier is disabled unless `ORBIT_REMINDER_SECRET` identifies a Secret
Manager version: `projects/metabook-system/secrets/<name>/versions/<version>`.
The VM startup script passes the non-sensitive `orbit-reminder-secret` metadata
value through to that environment variable. Grant the runtime service account
`roles/secretmanager.secretAccessor` on this secret only, not project-wide.
Local tests can instead set `ORBIT_REMINDER_CONFIG_FILE` to a private JSON file.

Secret contents (never print real values):

```json
{
  "apiKey": "Mailjet API key",
  "secretKey": "Mailjet secret key",
  "publicOrigin": "https://136-69-77-9.sslip.io"
}
```

Ordinary startup never enrolls accounts: the durable SQLite rows define the
existing cohort, and the loop resumes them without reading legacy preferences
or updating Firestore account authority. A subjects list in an older mail secret
has no effect. Missing/invalid mail configuration logs `reminders_unavailable`
and leaves synchronization available, with reminders and their settings endpoints
disabled until configuration is fixed and the process restarted. Sync readiness
is not proof of reminder health. SQLite/Repo corruption remains a startup error.

Enroll one explicitly selected account during provisioning/cutover. It must
already have a migrated, bound schema-2 root. Stop the owning sync container
before opening the same volume; this command does not enforce a cross-process
lock. With the usual storage root, Firebase identity, and mail configuration:

```sh
bun run --cwd packages/automerge-sync-server enroll-reminders \
  <Firebase-UID> --confirm-server-stopped
```

In the deployed image, run its normal `packages/automerge-sync-server/dist/index.js`
entry point with `--enroll-reminders <Firebase-UID> --confirm-server-stopped` and
the same stopped-writer volume/environment. The command uses the service's
ordinary Repo pool, but never listens or starts delivery. It closes the pool and
index before exiting; restart the normal sync container afterward. Do not run
an enrollment container alongside the live writer.

Enrollment initializes **absent** root preferences from legacy settings,
flushes that root, registers its SQLite row, then switches the account record
to `notificationMode: server`. A failure before that account update leaves the
legacy authority unchanged; retry preserves existing vault preferences, attempt
dates/counts, and deadlines,
including the same-local-day handoff guard. No other account is touched. Disable
an enrolled account's root preference or deliberately hand scheduling authority
back to remove it from reminders; changing the mail secret does not do that.

## Operations

The catalog is evaluated daily at the configured local time, but emails back
off: an initial invitation, then gaps of **2, 2, 5, 10, 20, and 30 local
calendar days**, then stop. Task activity (review, edit, creation) or an empty
queue resets the sequence; a catalog rollover or tasks becoming due solely
because time passes does not. Snooze/disable preserve the sequence. The
once-per-local-day guard applies even after activity resets it.

Activity detection hashes the catalog's existing task IDs, heads, due dates,
and deletion flags. It opens no task documents and adds no client/schema field.
SQLite persists the fingerprint and sequence attempt count. The current reader
accepts only the current index schema; experimental earlier database formats
have no runtime converter. Recovery uses a compatible quiesced whole-volume
snapshot, not an implicit database upgrade. The historical 2026-10-05 deployment
performed an additive backoff upgrade and preserved its dates/signing key; its
receipt below is deployment evidence, not a current compatibility path.

- Back up the entire single-writer volume, including SQLite, with the service
  stopped. Do not copy just `reminders.sqlite` while its WAL is live.
- Root/task data remains authoritative. Next-evaluation rows can be rebuilt;
  preserve the attempt dates/counts to retain backoff and avoid duplicate sends, and the HMAC
  key to keep email action links working after restore.
- `reminder_enrolled`, `reminder_evaluated`, `reminder_sent`, and
  `reminder_evaluation_failed` logs contain only counts/status/error names,
  never account IDs, document URLs, content, credentials, or action links.
- The reverse proxy must not log the query string on `/notifications`: it
  contains a limited-action credential. Keep load-balancer request logging off
  for this dogfood service; application logging stays enabled.
- Email GETs do not change settings. A POST using an unexpired signed link
  changes only notifications, not review data or identity. Links expire after
  14 days. Authenticated `POST /v1/notification-settings` with `{}` reads prefs;
  with `{"action":"unsubscribe"}` or `{"action":"snooze1Week"}` changes them.
- Mailjet responses can report per-message failure even with HTTP 200. Both
  HTTP and message status are checked. There is **no retry that local day**
  after an attempted delivery, including timeouts, rejected messages, or a
  crash between the SQLite commit and send. Pre-attempt storage/auth failures
  retry after five minutes. An attempted delivery consumes one backoff attempt
  even if sending fails. Do not clear an attempt date/count to test delivery.

Review links intentionally retain the existing Firebase one-use login code.
Migrating identity is not part of migrating notification computation/state.
Legacy account reminder workers remain deployed until their accounts migrate.

An image predating the `server` notification mode cannot read the new account
record. Prefer disabling the notifier in this image if delivery must be paused.
To roll back the whole image, first restore the saved pre-handoff account
notification fields as well as the quiesced volume; never assume an image-only
rollback restores scheduler authority. Existing vault preferences survive a
subsequent re-enrollment.

## Verification

`bun test src/notifications src/repo` covers the full backoff sequence, activity
and empty-queue resets, current database reopening, daily scheduling, DST, snooze,
unsubscribe, overlap, persisted attempts, ambiguous sends, token integrity,
Mailjet status handling, and eviction protection. `bun run test:integration`
also exercises ordinary files and the real HTTP settings surface, including
scanner-safe confirmation and persisted root changes, retryable enrollment,
and actual process startup with unavailable Firestore or malformed mail config.
Catalog fingerprint
regressions cover time-dependent due counts, equivalent entry encodings, and
rollover/fallback. No tests send real mail.

The backoff regression also verifies newest-first catalog selection: the
previous notifier reversed the shared decoder's already-newest-first order,
silently using the oldest generation after rollover. A task-head change in the
replacement generation must now change the activity fingerprint.

On 2026-10-03 the four reminder integrations passed, including a new test that
extracts snooze/unsubscribe links from the actual email template and follows
them through the HTTP server after a whole-volume local restore. It verifies
that the old signing key and attempt date survive, GET leaves preferences
unchanged, both POST actions persist after restart, and expired/tampered links
are rejected. This is synthetic local-data evidence; the current cloud-volume
restore drill remains a separate operational gate.

Before deployment, build the AMD64 image, verify its built-in SQLite support,
inspect runtime secret access, verify the proxy logging policy, and take a
quiesced snapshot. After deployment, verify public health/readiness, fresh logs,
the exact account mode, copied preferences, SQLite next deadline, and a normal
client sync. Verify the first **real scheduled** delivery via logs; do not
pretend a mocked Mailjet test proves production delivery.

## Andy-only backoff deployment, 2026-10-05

- Immutable AMD64 image:
  `sha256:59fae8b319ca297bdd61df3fe50e4a5e102549dfc9a85a4b758d19d07167af0f`.
  Workspace typecheck, lint, 36 server unit tests (six new backoff regressions),
  and all 13 server integrations passed. The exact nonroot, read-only image
  passed all four reminder integrations with isolated networking, plus a
  synthetic old-SQLite upgrade/eligibility check under its actual Node runtime.
- The sole writer `orbit-automerge-sync-e2` was stopped before snapshot
  `orbit-automerge-data-pre-backoff-20261005`, which reached `READY`. The private
  `rollback-backoff-20261005-binding.json` on that volume contains only the
  corresponding account-to-root binding, modes, and reminder dates/deadline;
  the Firestore backup read used an explicit field mask, not full account records.
- Machine size, disk attachment, IAM, notifier secret, and enrolled cohort did
  not change. Direct inspection verified the exact new container digest,
  zero restarts, one enrolled account, unchanged root binding, last attempt
  **2026-10-05**, and unchanged evaluation **2026-10-06 15:00:46.625 UTC**.
  The upgrade initialized sequence count 1 and retained the settings-link key
  row. The first eligible daily scan will establish the activity baseline;
  absent later activity resets, the first follow-up is **October 7 at 08:00 Pacific**.
- Local and public health/readiness recovered, and the load-balancer backend
  was `HEALTHY`. Fresh container log ingestion was present after startup.
  No post-startup failure/error records were found in the immediate check.
  Real scheduled backoff delivery remains a subsequent monitoring check; no
  attempt date was cleared and no test email was sent.

**Rollback:** the previous notifier inserts all six original SQLite columns
positionally, so it cannot re-enroll against the upgraded eight-column table.
Prefer a forward fix. A downgrade requires restoring the pre-backoff reminder
database from the quiesced checkpoint as well as the previous image, with the
writer stopped. Never restore the whole old volume over later review data
without preserving/reconciling that review tail. Account scheduling authority
remains `server`; this deployment did not change the handoff or binding.

## Andy-only activation, 2026-10-01

- Immutable AMD64 image:
  `sha256:242e3721e95f45e3bf0f00e652a44a3773ec011e1d881ec4547ca3df5d6d0115`.
  All 12 server integration tests passed; the exact nonroot, read-only Node 22
  container passed the three file/HTTP/enrollment reminder integrations.
- The sole writer VM was stopped before snapshot
  `orbit-automerge-data-pre-reminders-20261001`, which reached `READY`. The
  volume also contains `rollback-reminders-20261001-account.json`: the private
  pre-handoff account record needed for a full old-image rollback. This is an
  operator backup, not a runtime input.
- Secret version `projects/metabook-system/secrets/orbit-automerge-reminders/versions/1`
  enrolls only Andy. Its runtime accessor binding expires with the other
  runtime bindings on **2026-10-24 07:00 UTC**. The proxy's request logging is
  disabled; fresh content-free application log ingestion was verified using
  the monitor identity.
- Enrollment kept root `automerge:3ot66RkvY5yAxknGrUTYba7EojN6`, copied enabled
  preferences and the old (already-expired) snooze, set 08:00
  `America/Los_Angeles`, and retired the account's Firestore plan/deadline.
  Direct read-only inspection of persisted root chunks and SQLite independently
  verified one enrolled account, today's attempt date, and one settings-link
  key without opening a second Repo writer.
- The normal startup evaluation counted 1,325 due tasks; Mailjet accepted the
  reminder and `reminder_sent` reached Cloud Logging at **21:00:55 UTC**.
  Andy confirmed inbox receipt on 2026-10-01. The next persisted evaluation was
  **2026-10-02 15:00:38 UTC**, approximately 08:00 Pacific. No test resend or
  attempt-date reset was performed.
- Public health/readiness recovered, the container had zero restarts, and the
  post-evaluation working set used about 299 MiB of its 700 MiB limit. No fresh
  failure events were observed. Browser/client release details and the remaining
  physical-device acceptance are recorded in `README.md` and `PHASE3_GATES.md`.

The focused old-email compatibility function deployment also reported the
existing backend's Node 20 decommission deadline (2026-10-31) and failure to
clean up its Cloud Build images. Neither is a notifier dependency; review the
legacy runtime upgrade and only unreferenced build artifacts separately. Local
isolated packaging on a newer Node used `YARN_IGNORE_ENGINES=true`; the deployed
function's runtime was not changed.
