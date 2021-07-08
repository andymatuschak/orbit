import fs from "fs";
import os from "os";
import path from "path";
import {
  attachmentFolderName,
  databaseFileName,
  OrbitStoreFS,
} from "./orbitStoreFS";

let dbPath: string;
beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), "orbit-test-" + Math.random());
});

test("store is created when it doesn't exist", async () => {
  const store = await OrbitStoreFS.open(dbPath, true);

  const dbStats = await fs.promises.stat(path.join(dbPath, databaseFileName));
  expect(dbStats.isFile()).toBe(true);

  const attachmentStats = await fs.promises.stat(
    path.join(dbPath, attachmentFolderName),
  );
  expect(attachmentStats.isDirectory()).toBe(true);
  await store.close();

  // Make sure we can open it now with createIfMissing: false.
  const store2 = await OrbitStoreFS.open(dbPath, false);
  await store2.close();
});

test("store throws when it doesn't exist and is asked not to be created", async () => {
  await expect(
    async () => await OrbitStoreFS.open(dbPath, false),
  ).rejects.toBeTruthy();
});
