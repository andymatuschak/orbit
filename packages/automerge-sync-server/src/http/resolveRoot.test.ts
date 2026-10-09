import { describe, expect, test } from "bun:test";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { InMemoryHostedVaultAccountStore } from "../accounts/inMemoryAccountStore.js";
import {
  hostedAccount,
  verifiedPrincipal,
  testNowTimestampMillis,
} from "../testing/fixtures.js";
import { resolveRoot } from "./resolveRoot.js";

describe("server-owned account root provisioning", () => {
  test("binds a fresh account only after its initial documents are durable", async () => {
    const accounts = new InMemoryHostedVaultAccountStore([hostedAccount()]);
    const result = await resolveRoot({
      body: {},
      principal: verifiedPrincipal(),
      accounts,
      nowTimestampMillis: testNowTimestampMillis,
      createRoot: async (account) => {
        expect(account.hostedVaultID).toBe("account-a");
        expect((await accounts.getBySubject("user-a"))!.root.status).toBe(
          "unbound",
        );
        return root;
      },
    });
    expect(result).toEqual({ accountID: "account-a", rootDocumentURL: root });
    expect((await accounts.getBySubject("user-a"))!.root).toEqual({
      status: "bound",
      documentURL: root,
      boundAtTimestampMillis: testNowTimestampMillis,
    });
    await expect(
      resolveRoot({
        body: {},
        principal: verifiedPrincipal(),
        accounts,
        nowTimestampMillis: testNowTimestampMillis,
        createRoot: async () => {
          throw new Error("must not replace an existing root");
        },
      }),
    ).resolves.toEqual(result);
  });

  test("does not publish a root whose initial storage failed", async () => {
    const accounts = new InMemoryHostedVaultAccountStore([hostedAccount()]);
    await expect(
      resolveRoot({
        body: {},
        principal: verifiedPrincipal(),
        accounts,
        nowTimestampMillis: testNowTimestampMillis,
        createRoot: async () => {
          throw new Error("disk full");
        },
      }),
    ).rejects.toThrow("disk full");
    expect((await accounts.getBySubject("user-a"))!.root.status).toBe(
      "unbound",
    );
  });

  test("never creates an empty replacement for legacy or migrated accounts", async () => {
    for (const migration of [
      { mode: "legacy" as const },
      {
        ...hostedAccount().migration,
        mode: "automerge" as const,
        source: "legacy-cutover" as const,
        cutoverAtTimestampMillis: 1,
        rollbackUntilTimestampMillis: null,
        legacyArchiveKey: null,
      },
    ]) {
      const accounts = new InMemoryHostedVaultAccountStore([
        hostedAccount({ migration }),
      ]);
      let created = false;
      await expect(
        resolveRoot({
          body: {},
          principal: verifiedPrincipal(),
          accounts,
          nowTimestampMillis: testNowTimestampMillis,
          createRoot: async () => {
            created = true;
            return root;
          },
        }),
      ).rejects.toThrow();
      expect(created).toBe(false);
    }
  });

  test("concurrent first resolves elect the same sticky root", async () => {
    const accounts = new InMemoryHostedVaultAccountStore([hostedAccount()]);
    const results = await Promise.all(
      [root, "automerge:second-root" as AutomergeDocumentURL].map((candidate) =>
        resolveRoot({
          body: {},
          principal: verifiedPrincipal(),
          accounts,
          nowTimestampMillis: testNowTimestampMillis,
          createRoot: async () => candidate,
        }),
      ),
    );
    expect(results[0]).toEqual(results[1]);
  });
});

const root = "automerge:fresh-root" as AutomergeDocumentURL;
