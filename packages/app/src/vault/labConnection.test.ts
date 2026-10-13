import { expect, test } from "bun:test";
import type { AutomergeDocumentURL } from "@withorbit/core";
import {
  LabConnectionManager,
  MemoryLabConnectionStorage,
  normalizeLabOrigin,
} from "./labConnection.js";

const rootDocumentURL = "automerge:private-root" as AutomergeDocumentURL;

test("pairing creates independent local storage and survives offline reopening", async () => {
  const storage = new MemoryLabConnectionStorage();
  const manager = new LabConnectionManager(storage);
  expect(await manager.load()).toBeNull();
  const connection = await manager.pair({
    serviceOrigin: "https://laptop.example.test/",
    token: "private-key",
    rootDocumentURL,
  });
  expect(connection.localStoreID).toMatch(/^lab-/);
  expect(await new LabConnectionManager(storage).load()).toEqual(connection);
  const renewed = await manager.pair({ ...connection, token: "new-key" });
  expect(renewed.localStoreID).toBe(connection.localStoreID);
  const replacement = await manager.pair({
    ...connection,
    rootDocumentURL: "automerge:replacement" as AutomergeDocumentURL,
  });
  expect(replacement.localStoreID).not.toBe(connection.localStoreID);
});

test("old public registry data is not a valid Lab connection", async () => {
  const manager = new LabConnectionManager(
    new MemoryLabConnectionStorage(
      JSON.stringify({ schemaVersion: 2, hostedVaults: [] }),
    ),
  );
  await expect(manager.load()).rejects.toThrow("saved Lab connection");
  const paired = await manager.pair({
    serviceOrigin: "https://laptop.example.test",
    token: "key",
    rootDocumentURL,
  });
  expect(await manager.load()).toEqual(paired);
});

test("private origins reject cleartext remote hosts and credentials in URLs", () => {
  expect(normalizeLabOrigin("http://localhost:8787")).toBe(
    "http://localhost:8787",
  );
  for (const origin of [
    "http://remote.example.test",
    "https://secret@laptop.example.test",
    "https://laptop.example.test/path",
    "https://laptop.example.test?token=secret",
  ]) {
    expect(() => normalizeLabOrigin(origin)).toThrow("private HTTPS origin");
  }
});
