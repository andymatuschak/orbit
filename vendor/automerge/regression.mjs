// Public-safe reproduction: generated strings only, no Orbit data or network.
// Bound V8 Wasm memory so an unfixed build fails without exhausting host RAM:
// node --wasm-max-mem-pages=4096 vendor/automerge/regression.mjs
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as A from "@automerge/automerge";
import { Repo } from "@automerge/automerge-repo";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const summarize = (doc) => ({
  heads: A.getHeads(doc),
  entries: Object.entries(doc.entries)
    .map(([key, value]) => [key, value.toString()])
    .sort(),
  history: A.getAllChanges(doc)
    .map((change) => hash(change))
    .sort(),
});
function memoryStorage(saved = []) {
  const values = new Map(saved);
  const matches = (key, prefix) => prefix.every((part, i) => key[i] === part);
  return {
    values,
    async load(key) {
      return values.get(JSON.stringify(key));
    },
    async save(key, value) {
      values.set(JSON.stringify(key), value);
    },
    async remove(key) {
      values.delete(JSON.stringify(key));
    },
    async removeRange(prefix) {
      for (const key of values.keys())
        if (matches(JSON.parse(key), prefix)) values.delete(key);
    },
    async loadRange(prefix) {
      return [...values]
        .sort(([a], [b]) => a.localeCompare(b))
        .flatMap(([key, data]) => {
          key = JSON.parse(key);
          return matches(key, prefix) ? [{ key, data }] : [];
        });
    },
  };
}
if (process.argv[2] === "reopen") {
  const {
    storage: saved,
    url,
    expected,
  } = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  const storage = memoryStorage(
    saved.map(([key, value]) => [key, Buffer.from(value, "base64")]),
  );
  const repo = new Repo({ storage, network: [] });
  try {
    const handle = await repo.find(url, { signal: AbortSignal.timeout(10000) });
    assert.deepEqual(summarize(handle.doc()), expected);
    console.log(
      JSON.stringify({
        coldRepoOpen: true,
        entries: expected.entries.length,
        changes: expected.history.length,
        memory: process.memoryUsage(),
      }),
    );
  } finally {
    await repo.shutdown();
  }
} else {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "automerge-capacity-regression-"),
  );
  try {
    const storage = memoryStorage();
    const repo = new Repo({ storage, network: [] });
    let receipt;
    try {
      const handle = repo.create({
        entries: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [
            `key${String(i).padStart(5, "0")}`,
            new A.ImmutableString(`${i}:` + "x".repeat(8000)),
          ]),
        ),
      });
      await repo.flush();
      for (let i = 0; i < 1000; i++)
        handle.change((doc) => {
          doc.entries[`key${String(i).padStart(5, "0")}`] =
            new A.ImmutableString(`changed-${i}`);
        });
      await repo.flush();
      receipt = { url: handle.url, expected: summarize(handle.doc()) };
      assert.equal(receipt.expected.history.length, 1001);
      assert.deepEqual(
        receipt.expected.entries,
        Array.from({ length: 1000 }, (_, i) => [
          `key${String(i).padStart(5, "0")}`,
          `changed-${i}`,
        ]),
      );
    } finally {
      await repo.shutdown();
    }
    const keys = [...storage.values.keys()].map((key) => JSON.parse(key));
    assert.ok(keys.some((key) => key[1] === "snapshot"));
    assert.ok(keys.some((key) => key[1] === "incremental"));
    const fixture = path.join(directory, "storage.json");
    await fs.writeFile(
      fixture,
      JSON.stringify({
        ...receipt,
        storage: [...storage.values].map(([key, value]) => [
          key,
          Buffer.from(value).toString("base64"),
        ]),
      }),
    );
    const child = spawnSync(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), "reopen", fixture],
      { stdio: "inherit", timeout: 15000 },
    );
    assert.equal(
      child.status,
      0,
      "Fresh-process Repo reopen must preserve every value, head, and change",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
