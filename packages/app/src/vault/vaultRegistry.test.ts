import type { AutomergeDocumentURL } from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import {
  MemoryVaultRegistryStorage,
  selectCachedHostedReviewAccount,
  VaultRegistryManager,
} from "./vaultRegistry.js";

describe("vault registry", () => {
  test("keeps one local cache coordinate per hosted account", async () => {
    const manager = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const root = "automerge:hosted-root" as AutomergeDocumentURL;
    const first = await manager.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-a",
      accountID: "account-a",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: root,
    });
    const reopened = await manager.getOrCreateHostedAccountVault({
      authenticationUserID: "firebase-a",
      accountID: "account-a",
      serviceOrigin: "https://sync.example.test",
      rootDocumentURL: root,
    });

    expect(reopened).toEqual(first);
    expect((await manager.getRegistry()).hostedVaults).toEqual([first]);
  });

  test("optimistically selects only an unambiguous eligible local account", async () => {
    const manager = new VaultRegistryManager(new MemoryVaultRegistryStorage());
    const add = (authenticationUserID: string, serviceOrigin: string) =>
      manager.getOrCreateHostedAccountVault({
        authenticationUserID,
        accountID: authenticationUserID,
        serviceOrigin,
        rootDocumentURL:
          `automerge:${authenticationUserID}` as AutomergeDocumentURL,
      });
    await add("firebase-a", "https://sync.example.test");
    const select = (eligible: (userID: string) => boolean = () => true) =>
      selectCachedHostedReviewAccount(
        registry,
        "https://sync.example.test",
        eligible,
      );
    let registry = await manager.getRegistry();
    expect(select()).toBe("firebase-a");
    expect(select(() => false)).toBeNull();
    await add("firebase-b", "https://other.example.test");
    registry = await manager.getRegistry();
    expect(select()).toBe("firebase-a");
    await add("firebase-c", "https://sync.example.test");
    registry = await manager.getRegistry();
    expect(select()).toBeNull();
  });

  test("rejects hosted cache coordinates without their authenticated identity", async () => {
    const storage = new MemoryVaultRegistryStorage(
      JSON.stringify({
        schemaVersion: 2,
        hostedVaults: [
          {
            kind: "hosted",
            accountID: "account-a",
            serviceOrigin: "https://sync.example.test",
            rootDocumentURL: "automerge:hosted-root",
            localStoreID: "vault-0000000000000000000000",
          },
        ],
      }),
    );
    const manager = new VaultRegistryManager(storage);
    await expect(manager.getRegistry()).rejects.toThrow(
      "Malformed hosted vault registry entry",
    );
  });

  test("rejects unknown and malformed persisted registry data", async () => {
    for (const serialized of [
      '{"schemaVersion":99,"hostedVaults":[]}',
      '{"schemaVersion":2}',
    ]) {
      await expect(
        new VaultRegistryManager(
          new MemoryVaultRegistryStorage(serialized),
        ).getRegistry(),
      ).rejects.toThrow("Unknown or malformed vault registry");
    }
  });
});
