import type { AutomergeDocumentURL } from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import { HostedAccountError } from "./accountStore.js";
import { InMemoryHostedVaultAccountStore } from "./inMemoryAccountStore.js";
import { hostedAccount, testNowTimestampMillis } from "../testing/fixtures.js";

describe("hosted account root binding", () => {
  test("rejects legacy and unprovisioned accounts", async () => {
    const legacy = hostedAccount({
      authSubject: "legacy",
      migration: { mode: "legacy" },
      notificationMode: "legacy",
    });
    const store = new InMemoryHostedVaultAccountStore([legacy]);
    for (const subject of ["legacy", "missing"]) {
      await expect(
        store.bindOrResolveRoot({
          subject,
          issuer: "https://securetoken.google.com/orbit-test",
          proposedRootDocumentURL: root(subject),
          nowTimestampMillis: testNowTimestampMillis,
        }),
      ).rejects.toBeInstanceOf(HostedAccountError);
    }
  });

  test("elects one sticky root under concurrent first binds", async () => {
    const store = new InMemoryHostedVaultAccountStore([hostedAccount()]);
    const [first, second] = await Promise.all([
      store.bindOrResolveRoot({
        subject: "user-a",
        issuer: "https://securetoken.google.com/orbit-test",
        proposedRootDocumentURL: root("first"),
        nowTimestampMillis: testNowTimestampMillis,
      }),
      store.bindOrResolveRoot({
        subject: "user-a",
        issuer: "https://securetoken.google.com/orbit-test",
        proposedRootDocumentURL: root("second"),
        nowTimestampMillis: testNowTimestampMillis + 1,
      }),
    ]);

    expect(first.disposition).toBe("bound-proposed");
    expect(second.disposition).toBe("existing-root");
    expect(first.accountID).toBe("account-a");
    expect(second.accountID).toBe("account-a");
    expect(first.binding.documentURL).toBe(root("first"));
    expect(second.binding.documentURL).toBe(root("first"));
  });
});

function root(suffix: string) {
  return `automerge:${suffix}` as AutomergeDocumentURL;
}
