import assert from "node:assert/strict";
import { test } from "node:test";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateAutomergeUrl } from "@automerge/automerge-repo";
import {
  ImmutableString,
  getHeads as automergeHeads,
} from "@automerge/automerge";
import {
  defaultOrbitSchedulerPolicy,
  TaskContentType,
  TaskSpecType,
} from "../../core/dist/index.js";
import {
  RepoPerTaskDocuments,
  unwrapDocument,
} from "../../store-automerge/dist/index.js";
import { PerTaskRepository } from "../../store-shared/dist/perTaskRepository.js";
import { decodePerTaskVaultRoot } from "../../store-shared/dist/perTaskCodec.js";
import {
  HostedSyncService,
  AccountRepoPool,
  InMemoryHostedVaultAccountStore,
  MemorySafeLogger,
  configurationFromEnvironment,
} from "../dist/index.js";
import { readReminderCatalog } from "../dist/notifications/vaultReminders.js";
import { ReminderIndex } from "../dist/notifications/reminderIndex.js";
import { VaultReminderService } from "../dist/notifications/vaultReminderService.js";
import { ReminderActionTokens } from "../dist/notifications/reminderActions.js";
import { createReminderDelivery } from "../dist/notifications/mailjetDelivery.js";
import { localReminderTime } from "../dist/notifications/reminderSchedule.js";

const prefs = {
  enabled: false,
  timeZone: "America/Los_Angeles",
  localTimeMinutes: 480,
  snoozedUntilTimestampMillis: null,
};

test("explicit enrollment survives a failed handoff and preserves preferences, today's attempt, and deadlines", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-reminder-enrollment-"),
  );
  const pool = new AccountRepoPool(
    configurationFromEnvironment({ ORBIT_SYNC_STORAGE_ROOT: directory }),
  );
  const index = new ReminderIndex(path.join(directory, "reminders.sqlite"));
  const now = Date.parse("2026-10-01T16:00:00Z");
  let controller;
  try {
    let rootURL;
    await pool.withRepo("reminder-vault", async (repo) => {
      const vault = await PerTaskRepository.create(
        new RepoPerTaskDocuments(repo),
        logicalVault(),
      );
      rootURL = vault.rootURL;
      await vault.close();
    });
    let account = {
      schemaVersion: 1,
      authIssuer: "https://securetoken.google.com/test",
      authSubject: "reader",
      emailAddress: "reader@example.test",
      registrationTimestampMillis: 1000,
      hostedVaultID: "reminder-vault",
      root: {
        status: "bound",
        documentURL: rootURL,
        boundAtTimestampMillis: 1000,
      },
      migration: {
        mode: "automerge",
        source: "new-account",
        cutoverAtTimestampMillis: 1000,
        rollbackUntilTimestampMillis: null,
        legacyArchiveKey: null,
      },
      notificationMode: "pending",
    };
    const accounts = new InMemoryHostedVaultAccountStore([account]);
    let legacyReads = 0;
    let failHandoff = true;
    const firestore = {
      doc: () => ({
        get: async () => {
          legacyReads++;
          return {
            data: () => ({
              isUnsubscribedFromSessionNotifications: true,
              snoozeSessionNotificationsUntilTimestampMillis: now + 1234,
              sessionNotificationState: {
                lastNotificationTimestampMillis: now - 1000,
              },
            }),
          };
        },
        update: async (fields) => {
          assert.equal(fields.notificationMode, "server");
          assert.equal(
            index.due(now)[0].lastAttemptDate,
            "2026-10-01",
            "legacy same-day attempt is durable before authority changes",
          );
          await pool.withVault("reminder-vault", rootURL, async (vault) => {
            assert.equal(
              (await vault.getNotificationPreferences()).enabled,
              false,
              "root preferences are durable before authority changes",
            );
          });
          if (failHandoff) throw new Error("handoff temporarily unavailable");
          account = { ...account, notificationMode: "server" };
          accounts.set(account);
        },
      }),
    };
    controller = new VaultReminderService({
      accounts,
      repos: pool,
      index,
      firestore,
      logger: new MemorySafeLogger(),
      apiKey: "key",
      secretKey: "secret",
      publicOrigin: "https://sync.example.test",
    });
    await assert.rejects(controller.enroll("reader", now), /handoff/);
    assert.equal(
      (await accounts.getBySubject("reader")).notificationMode,
      "pending",
      "failed handoff leaves legacy notification authority intact",
    );
    assert.equal(index.due(now)[0].attemptCount, 1);
    failHandoff = false;
    await controller.enroll("reader", now + 1000);
    assert.equal(
      index.due(now)[0].attemptCount,
      1,
      "retry cannot duplicate today's legacy attempt",
    );
    assert.deepEqual(await controller.preferences("reader"), {
      ...prefs,
      snoozedUntilTimestampMillis: now + 1234,
    });
    assert.equal(
      (await accounts.getBySubject("reader")).notificationMode,
      "server",
    );
    assert.equal(index.due(now)[0].lastAttemptDate, "2026-10-01");
    await controller.update("reader", "snooze1Week", now);
    index.schedule("reader", now + 86400000);
    await controller.enroll("reader", now + 5000);
    assert.equal(
      legacyReads,
      2,
      "handoff retry reads legacy state, but enrollment after success does not",
    );
    assert.equal((await controller.preferences("reader")).enabled, true);
    assert.equal(index.due(now).length, 0, "reenrollment preserves deadline");
  } finally {
    controller?.close();
    await pool.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});
function logicalVault() {
  const tasks = Object.fromEntries(
    ["due", "future", "deleted"].map((id) => [
      id,
      {
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.Plain,
            body: { text: id, attachments: [] },
          },
        },
        createdAtTimestampMillis: 1000,
        provenance: null,
        metadata: {},
        isDeleted: id === "deleted",
      },
    ]),
  );
  return {
    vaultID: "reminder-vault",
    createdAtTimestampMillis: 1000,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks,
    observations: {},
    attachments: {},
  };
}

test("notifier opens only root/catalog after eviction, reads changes, falls back across missing rollover, and saves preferences", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-reminder-integration-"),
  );
  const pool = new AccountRepoPool({
    ...configurationFromEnvironment({ ORBIT_SYNC_STORAGE_ROOT: directory }),
    idleRepoTimeoutMillis: 1,
  });
  let rootURL, catalogURL;
  try {
    await pool.withRepo("reader", async (repo) => {
      const vault = await PerTaskRepository.create(
        new RepoPerTaskDocuments(repo),
        logicalVault(),
      );
      rootURL = vault.rootURL;
      catalogURL = vault.catalogURL;
      await vault.setNotificationPreferences(prefs);
      const catalog = await repo.find(catalogURL);
      const future = JSON.parse(String(catalog.doc().entries.future));
      catalog.change((draft) => {
        draft.entries.future = new ImmutableString(
          JSON.stringify({
            ...future,
            nextDueTimestampMillis: Date.now() + 86_400_000,
          }),
        );
      });
      await repo.flush([catalog.documentId]);
      await vault.close();
    });
    await pool.evictIdle(Date.now() + 100);
    assert.equal((await pool.metrics()).loadedAccountRepos, 0);
    await pool.withVault("reader", rootURL, async (vault, repo) => {
      const time = Date.now();
      const initial = await readReminderCatalog(vault, time);
      assert.equal(initial.due, 1);
      const later = await readReminderCatalog(vault, time + 2 * 86_400_000);
      assert.equal(later.due, 2);
      assert.equal(
        later.fingerprint,
        initial.fingerprint,
        "time alone is not task activity",
      );
      assert.equal(
        Object.keys(repo.handles).length,
        2,
        "no task histories materialized",
      );
      assert.deepEqual(await vault.getNotificationPreferences(), prefs);
      const catalog = await repo.find(catalogURL);
      const due = JSON.parse(String(catalog.doc().entries.due));
      catalog.change((draft) => {
        draft.entries.due = new ImmutableString(
          JSON.stringify(Object.fromEntries(Object.entries(due).reverse())),
        );
      });
      assert.equal(
        (await readReminderCatalog(vault, time)).fingerprint,
        initial.fingerprint,
        "equivalent packed encodings are not task activity",
      );
      catalog.change((draft) => {
        draft.entries.due = new ImmutableString(
          JSON.stringify({
            ...due,
            nextDueTimestampMillis: Date.now() + 86_400_000,
          }),
        );
      });
      const changed = await readReminderCatalog(vault, time);
      assert.equal(changed.due, 0);
      assert.notEqual(changed.fingerprint, initial.fingerprint);
      const handle = await repo.find(rootURL);
      handle.change((draft) => {
        draft.catalogCandidates.missing = new ImmutableString(
          JSON.stringify({
            generation: 1,
            documentURL: generateAutomergeUrl(),
            predecessorDocumentURL: catalogURL,
            initialCatalogHeads: [],
          }),
        );
      });
      assert.deepEqual(await readReminderCatalog(vault, time), changed);
      const replacement = repo.create({
        documentType: catalog.doc().documentType,
        schemaVersion: 2,
        vaultID: catalog.doc().vaultID,
        generation: 1,
        predecessorDocumentURL: new ImmutableString(catalogURL),
        entries: Object.fromEntries(
          Object.entries(catalog.doc().entries)
            .reverse()
            .map(([id, entry]) => [id, new ImmutableString(String(entry))]),
        ),
      });
      await repo.flush([replacement.documentId]);
      handle.change((draft) => {
        draft.catalogCandidates.missing = new ImmutableString(
          JSON.stringify({
            generation: 1,
            documentURL: replacement.url,
            predecessorDocumentURL: catalogURL,
            initialCatalogHeads: automergeHeads(replacement.doc()),
          }),
        );
      });
      assert.equal(
        decodePerTaskVaultRoot(unwrapDocument(handle.doc()))
          .catalogCandidates[0].documentURL,
        replacement.url,
      );
      assert.deepEqual(
        await readReminderCatalog(vault, time),
        changed,
        "rollover identity, entry order, and catalog history are not task activity",
      );
      replacement.change((draft) => {
        const entry = JSON.parse(String(draft.entries.due));
        draft.entries.due = new ImmutableString(
          JSON.stringify({
            ...entry,
            indexedTaskHeads: ["0".repeat(64)],
          }),
        );
      });
      assert.deepEqual(
        JSON.parse(String((await repo.find(replacement.url)).doc().entries.due))
          .indexedTaskHeads,
        ["0".repeat(64)],
      );
      const headsChanged = await readReminderCatalog(vault, time);
      assert.equal(headsChanged.due, changed.due);
      assert.notEqual(
        headsChanged.fingerprint,
        changed.fingerprint,
        "task edits reset backoff even when the due date stays the same",
      );
      await vault.setNotificationPreferences({
        ...prefs,
        enabled: true,
      });
    });
    await pool.evictIdle(Date.now() + 100);
    await pool.withVault("reader", rootURL, async (vault) =>
      assert.equal((await vault.getNotificationPreferences()).enabled, true),
    );
  } finally {
    await pool.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("email GET only confirms; POST writes durable vault settings, ID endpoint checks identity and CORS", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-reminder-http-"),
  );
  let service, pool, controller, rootURL;
  try {
    const account = {
      schemaVersion: 1,
      authIssuer: "https://securetoken.google.com/test",
      authSubject: "reader",
      emailAddress: "reader@example.test",
      registrationTimestampMillis: 1000,
      hostedVaultID: "reminder-vault",
      root: { status: "unbound" },
      migration: {
        mode: "automerge",
        source: "new-account",
        cutoverAtTimestampMillis: 1000,
        rollbackUntilTimestampMillis: null,
        legacyArchiveKey: null,
      },
      notificationMode: "server",
    };
    const accounts = new InMemoryHostedVaultAccountStore([account]);
    const configuration = {
      ...configurationFromEnvironment({ ORBIT_SYNC_STORAGE_ROOT: directory }),
      port: 0,
      allowedOrigins: new Set(["https://withorbit.com"]),
    };
    const index = new ReminderIndex(path.join(directory, "reminders.sqlite"));
    service = new HostedSyncService(configuration, {
      accounts,
      verifier: {
        verifyIDToken: async (token) => {
          if (token !== "valid") throw new Error("wrong token");
          return {
            subject: "reader",
            issuer: account.authIssuer,
            expiresAtTimestampMillis: Date.now() + 60_000,
          };
        },
      },
      createReminders: (repos) => {
        pool = repos;
        controller = new VaultReminderService({
          accounts,
          repos,
          index,
          logger: new MemorySafeLogger(),
          firestore: {
            collection: () => {
              throw new Error("No email expected");
            },
          },
          apiKey: "key",
          secretKey: "secret",
          publicOrigin: "https://sync.example.test",
        });
        return controller;
      },
    });
    await pool.withRepo(account.hostedVaultID, async (repo) => {
      const vault = await PerTaskRepository.create(
        new RepoPerTaskDocuments(repo),
        logicalVault(),
      );
      rootURL = vault.rootURL;
      await vault.setNotificationPreferences(prefs);
      await vault.close();
    });
    account.root = {
      status: "bound",
      documentURL: rootURL,
      boundAtTimestampMillis: Date.now(),
    };
    accounts.set(account);
    index.register({
      authSubject: account.authSubject,
      accountID: account.hostedVaultID,
      rootDocumentURL: rootURL,
      emailAddress: account.emailAddress,
      nextEvaluation: Date.now(),
    });
    const { port } = await service.start(),
      origin = `http://127.0.0.1:${port}`;
    const token = controller.actionTokens.create("reader", Date.now());
    const url = `${origin}/notifications?token=${token}&action=snooze1Week`;
    const confirmation = await fetch(url);
    assert.equal(confirmation.status, 200);
    assert.equal(confirmation.headers.get("cache-control"), "no-store");
    assert.equal(confirmation.headers.get("referrer-policy"), "no-referrer");
    assert.match(await confirmation.text(), /form method="post"/);
    assert.equal(
      (await controller.preferences("reader")).snoozedUntilTimestampMillis,
      null,
    );
    const posted = await fetch(url, { method: "POST", redirect: "manual" });
    assert.equal(posted.status, 303);
    const updated = await controller.preferences("reader");
    assert.equal(updated.enabled, true);
    assert.ok(
      updated.snoozedUntilTimestampMillis > Date.now() + 6 * 86_400_000,
    );
    assert.equal((await fetch(url + "x", { method: "POST" })).status, 400);
    const request = (headers) =>
      fetch(`${origin}/v1/notification-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "unsubscribe" }),
      });
    assert.equal((await request({ Authorization: "ID invalid" })).status, 401);
    assert.equal(
      (
        await request({
          Authorization: "ID valid",
          Origin: "https://evil.example",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request({
          Authorization: "ID valid",
          Origin: "https://withorbit.com",
        })
      ).status,
      200,
    );
    assert.equal((await controller.preferences("reader")).enabled, false);
    await service.shutdown();
    service = null;
    const reopened = new AccountRepoPool(configuration);
    try {
      await reopened.withVault(account.hostedVaultID, rootURL, async (vault) =>
        assert.equal((await vault.getNotificationPreferences()).enabled, false),
      );
    } finally {
      await reopened.shutdown();
    }
  } finally {
    await service?.shutdown();
    await rm(directory, { recursive: true, force: true });
  }
});

test("links from the actual email survive volume restore and persist snooze/unsubscribe without another send", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-reminder-restore-"),
  );
  const source = path.join(directory, "source");
  const restored = path.join(directory, "restored");
  await mkdir(source);
  const now = Date.now();
  const today = localReminderTime(now, prefs.timeZone).date;
  const configuration = {
    ...configurationFromEnvironment({ ORBIT_SYNC_STORAGE_ROOT: source }),
    port: 0,
  };
  let pool = new AccountRepoPool(configuration);
  let index = new ReminderIndex(path.join(source, "reminders.sqlite"));
  let service;
  let ownedPool = pool;
  let ownedIndex = index;
  try {
    let rootURL;
    await pool.withRepo("reminder-vault", async (repo) => {
      const vault = await PerTaskRepository.create(
        new RepoPerTaskDocuments(repo),
        logicalVault(),
      );
      rootURL = vault.rootURL;
      await vault.setNotificationPreferences({
        ...prefs,
        enabled: true,
      });
      await vault.close();
    });
    const account = {
      schemaVersion: 1,
      authIssuer: "https://securetoken.google.com/test",
      authSubject: "reader",
      emailAddress: "reader@example.test",
      registrationTimestampMillis: 1000,
      hostedVaultID: "reminder-vault",
      root: {
        status: "bound",
        documentURL: rootURL,
        boundAtTimestampMillis: 1000,
      },
      migration: {
        mode: "automerge",
        source: "new-account",
        cutoverAtTimestampMillis: 1000,
        rollbackUntilTimestampMillis: null,
        legacyArchiveKey: null,
      },
      notificationMode: "server",
    };
    const row = {
      authSubject: account.authSubject,
      accountID: account.hostedVaultID,
      rootDocumentURL: rootURL,
      emailAddress: account.emailAddress,
      nextEvaluation: now + 86_400_000,
    };
    index.register(row);
    index.observeCatalog("reader", "saved-activity-baseline", true);
    assert.equal(
      index.recordAttempt("reader", today, row.nextEvaluation),
      true,
    );
    const tokens = new ReminderActionTokens(index);
    const issuedToken = tokens.create("reader", now);
    const expiredToken = tokens.create("reader", now - 15 * 86_400_000);
    const storageID = await pool.storageID(account.hostedVaultID);
    await pool.shutdown();
    ownedPool = null;
    index.close();
    ownedIndex = null;
    await cp(source, restored, { recursive: true });

    index = new ReminderIndex(path.join(restored, "reminders.sqlite"));
    ownedIndex = index;
    const restoredTokens = new ReminderActionTokens(index);
    assert.equal(
      restoredTokens.verify(issuedToken, now),
      "reader",
      "pre-backup link retains its HMAC key",
    );
    assert.equal(index.due(now + 86_400_000)[0].lastAttemptDate, today);
    assert.equal(index.due(now + 86_400_000)[0].attemptCount, 1);
    assert.equal(
      index.due(now + 86_400_000)[0].catalogFingerprint,
      "saved-activity-baseline",
    );
    assert.equal(
      index.recordAttempt("reader", today, row.nextEvaluation),
      false,
      "restore cannot resend today's reminder",
    );
    let controller;
    let unexpectedDelivery = 0;
    service = new HostedSyncService(
      { ...configuration, storageRoot: restored },
      {
        accounts: new InMemoryHostedVaultAccountStore([account]),
        verifier: {
          verifyIDToken: async () => {
            throw new Error("Email links do not require login");
          },
        },
        createReminders: (repos) => {
          pool = repos;
          controller = new VaultReminderService({
            accounts: new InMemoryHostedVaultAccountStore([account]),
            repos,
            index,
            logger: new MemorySafeLogger(),
            firestore: {
              collection: () => {
                unexpectedDelivery++;
                throw new Error("No delivery or production access permitted");
              },
            },
            apiKey: "unused",
            secretKey: "unused",
            publicOrigin: "http://127.0.0.1",
          });
          return controller;
        },
      },
    );
    ownedIndex = null; // The service now owns its Repo pool and SQLite index.
    assert.equal(await pool.storageID(account.hostedVaultID), storageID);
    index.schedule("reader", now); // Exercise the restored loop, not just SQL.
    const { port } = await service.start();
    const origin = `http://127.0.0.1:${port}`;
    let message;
    await createReminderDelivery({
      firestore: {
        collection: () => ({
          doc: () => ({ id: "test-login-code", set: async () => {} }),
        }),
      },
      apiKey: "test",
      secretKey: "test",
      publicOrigin: origin,
      actionTokens: tokens,
      fetchImplementation: async (_url, request) => {
        message = JSON.parse(request.body).Messages[0];
        return new Response(
          JSON.stringify({ Messages: [{ Status: "success" }] }),
        );
      },
    })(row, now);
    const links = [...message.HTMLPart.matchAll(/href="([^"]+)"/g)].map(
      (match) => match[1].replaceAll("&amp;", "&"),
    );
    for (const action of ["snooze1Week", "unsubscribe"]) {
      const url = links.find(
        (link) => new URL(link).searchParams.get("action") === action,
      );
      assert.ok(url, "settings link exists in rendered email");
      const before = await controller.preferences("reader");
      const confirmation = await fetch(url);
      assert.equal(confirmation.status, 200);
      assert.match(await confirmation.text(), /form method="post"/);
      assert.deepEqual(
        await controller.preferences("reader"),
        before,
        "GET/link scanner cannot change settings",
      );
      const result = await fetch(url, { method: "POST", redirect: "manual" });
      assert.equal(result.status, 303);
      assert.equal(
        result.headers.get("location"),
        `https://withorbit.com/settings?completedAction=${action}`,
      );
      const after = await controller.preferences("reader");
      assert.equal(after.enabled, action === "snooze1Week");
      if (action === "snooze1Week")
        assert.ok(after.snoozedUntilTimestampMillis >= now + 7 * 86_400_000);
    }
    const rejected = (token) =>
      fetch(`${origin}/notifications?token=${token}&action=unsubscribe`, {
        method: "POST",
      });
    assert.equal((await rejected(expiredToken)).status, 400);
    assert.equal((await rejected(issuedToken + "x")).status, 400);
    assert.equal(index.due(Date.now())[0].lastAttemptDate, today);
    await service.shutdown();
    service = null;
    assert.equal(
      unexpectedDelivery,
      0,
      "restore preserves today's delivery attempt",
    );
    pool = new AccountRepoPool({ ...configuration, storageRoot: restored });
    ownedPool = pool;
    await pool.withVault(account.hostedVaultID, rootURL, async (vault) => {
      const saved = await vault.getNotificationPreferences();
      assert.equal(saved.enabled, false);
      assert.ok(saved.snoozedUntilTimestampMillis >= now + 7 * 86_400_000);
    });
  } finally {
    await service?.shutdown();
    await ownedPool?.shutdown();
    ownedIndex?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
