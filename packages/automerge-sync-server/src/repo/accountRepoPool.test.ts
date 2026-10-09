import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { AccountRepoPool } from "./accountRepoPool.js";
import type { VaultID } from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { AutomergeUrl } from "@automerge/automerge-repo";

const temporaryDirectories: string[] = [];
const pools: AccountRepoPool[] = [];

afterEach(async () => {
  await Promise.allSettled(pools.splice(0).map((pool) => pool.shutdown()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("bounds loaded accounts and preserves storage identity across eviction", async () => {
  let nowTimestampMillis = 1_000;
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 2,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 1_000,
    recycleAfterRepoCreations: 2,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
    now: () => nowTimestampMillis,
  });
  pools.push(pool);

  const firstStorageID = await pool.storageID("account-a");
  nowTimestampMillis++;
  await pool.storageID("account-b");
  expect(await pool.metrics()).toMatchObject({
    loadedAccountRepos: 1,
    repoCreations: 2,
    repoShutdowns: 1,
    shouldRecycleProcess: true,
  });

  nowTimestampMillis++;
  expect(await pool.storageID("account-a")).toBe(firstStorageID);
  expect((await pool.metrics()).loadedAccountRepos).toBe(1);

  nowTimestampMillis += 1_001;
  expect(await pool.evictIdle()).toBe(1);
  expect(await pool.metrics()).toMatchObject({
    loadedAccountRepos: 0,
    activeSockets: 0,
  });
});

test("serializes simultaneous cold opens under the loaded-account cap", async () => {
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 2,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 60_000,
    recycleAfterRepoCreations: 100,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
  });
  pools.push(pool);

  await Promise.all([
    pool.storageID("account-a"),
    pool.storageID("account-b"),
    pool.storageID("account-c"),
  ]);

  expect(await pool.metrics()).toMatchObject({
    loadedAccountRepos: 1,
    repoCreations: 3,
    repoShutdowns: 2,
  });
});

test("releases an account slot when authentication finishes after a socket closes", async () => {
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 1,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 60_000,
    recycleAfterRepoCreations: 100,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
  });
  pools.push(pool);

  await expect(
    pool.attachSocket("account-a", { readyState: 3 } as never, {} as never),
  ).rejects.toThrow("closed sync socket");
  expect(await pool.metrics()).toMatchObject({
    loadedAccountRepos: 1,
    activeSockets: 0,
  });
});

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-sync-pool-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

test("an active server operation cannot be evicted to admit another account", async () => {
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 2,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 1,
    recycleAfterRepoCreations: 100,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
  });
  pools.push(pool);
  let started!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const operation = pool.withRepo("account-a", async () => {
    started();
    await wait;
  });
  await ready;
  expect(await pool.evictIdle(Date.now() + 1000)).toBe(0);
  await expect(pool.storageID("account-b")).rejects.toThrow(
    "All account Repo slots are active",
  );
  release();
  await operation;
  await pool.storageID("account-b");
  expect((await pool.metrics()).loadedAccountRepos).toBe(1);
});

test("server consumers share one repository until its account is evicted", async () => {
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 2,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 60_000,
    recycleAfterRepoCreations: 100,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
  });
  pools.push(pool);
  const rootURL = await pool.withRepo("account-a", async (repo) => {
    const vault = await PerTaskRepository.createEmpty(
      new RepoPerTaskDocuments(repo),
      {
        vaultID: "account-a" as VaultID,
      },
    );
    const rootURL = vault.rootURL;
    await vault.close();
    return rootURL;
  });
  const [first, concurrent] = await Promise.all([
    pool.withVault("account-a", rootURL, async (vault) => vault),
    pool.withVault("account-a", rootURL, async (vault) => vault),
  ]);
  expect(concurrent).toBe(first);
  const preferences = {
    enabled: true,
    timeZone: "UTC",
    localTimeMinutes: 480,
    snoozedUntilTimestampMillis: null,
  };
  await pool.withVault("account-a", rootURL, (vault) =>
    vault.setNotificationPreferences(preferences),
  );
  await pool.withVault("account-a", rootURL, async (vault, repo) => {
    expect(vault).toBe(first);
    expect(await vault.getNotificationPreferences()).toEqual(preferences);
    expect(Object.keys(repo.handles)).toHaveLength(2);
  });
  await pool.storageID("account-b");
  expect(() => first.getNotificationPreferences()).toThrow("closed");
  await pool.withVault("account-a", rootURL, async (vault) => {
    expect(vault).not.toBe(first);
    expect(await vault.getNotificationPreferences()).toEqual(preferences);
  });
});

test("failed vault opens release observers before retrying on the same Repo", async () => {
  const pool = new AccountRepoPool({
    storageRoot: await temporaryDirectory(),
    maximumLoadedAccounts: 1,
    maximumSocketsPerAccount: 2,
    maximumStorageBytesPerAccount: 1_000_000,
    storageConcurrency: 4,
    idleRepoTimeoutMillis: 60_000,
    recycleAfterRepoCreations: 100,
    recycleRSSBytes: Number.MAX_SAFE_INTEGER,
  });
  pools.push(pool);
  await pool.withRepo("account-a", async (repo) => {
    const initial = await PerTaskRepository.createEmpty(
      new RepoPerTaskDocuments(repo),
      { vaultID: "account-a" as VaultID },
    );
    const { rootURL, catalogURL } = initial;
    await initial.close();
    const root = await repo.find(rootURL as unknown as AutomergeUrl);
    const catalog = await repo.find<{ generation: number }>(
      catalogURL as unknown as AutomergeUrl,
    );
    const rootListeners = root.listenerCount("heads-changed");
    const catalogListeners = catalog.listenerCount("heads-changed");
    catalog.change((document) => {
      document.generation = -1;
    });
    await repo.flush([catalog.documentId]);

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        pool.withVault("account-a", rootURL, async () => undefined),
      ).rejects.toThrow("$catalog.generation");
      expect(root.listenerCount("heads-changed")).toBe(rootListeners);
      expect(catalog.listenerCount("heads-changed")).toBe(catalogListeners);
    }

    catalog.change((document) => {
      document.generation = 0;
    });
    await repo.flush([catalog.documentId]);
    await pool.withVault("account-a", rootURL, async (vault) => {
      expect(vault.vaultID).toBe("account-a");
    });
    expect(root.listenerCount("heads-changed")).toBe(rootListeners + 1);
    expect(catalog.listenerCount("heads-changed")).toBe(catalogListeners + 1);
    expect(await pool.metrics()).toMatchObject({
      repoCreations: 1,
      repoShutdowns: 0,
    });
  });
});
