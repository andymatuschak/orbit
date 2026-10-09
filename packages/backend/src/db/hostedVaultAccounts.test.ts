import { describe, expect, test } from "bun:test";
import {
  accountPermitsLegacyWrites,
  newHostedVaultAccountRecord,
} from "./hostedVaultAccounts.js";

const input = {
  authIssuer: "https://securetoken.google.com/orbit-test",
  authSubject: "user-a",
  emailAddress: "user-a@example.test",
  registrationTimestampMillis: 1_800_000_000_000,
} as const;

describe("hosted account provisioning", () => {
  test("legacy records cannot bind and keep legacy reminders authoritative", () => {
    expect(
      newHostedVaultAccountRecord({ ...input, mode: "legacy" }, "hosted-a"),
    ).toMatchObject({
      hostedVaultID: "hosted-a",
      root: { status: "unbound" },
      migration: { mode: "legacy" },
      notificationMode: "legacy",
    });
  });

  test("only legacy accounts remain writable through the legacy API", () => {
    const legacy = newHostedVaultAccountRecord(
      { ...input, mode: "legacy" },
      "hosted-a",
    );
    const automerge = newHostedVaultAccountRecord(
      { ...input, mode: "new-automerge" },
      "hosted-b",
    );
    expect(accountPermitsLegacyWrites(null)).toBe(true);
    expect(accountPermitsLegacyWrites(legacy)).toBe(true);
    expect(
      accountPermitsLegacyWrites({
        migration: {
          mode: "migrating",
          jobID: "job-a",
          startedAtTimestampMillis: input.registrationTimestampMillis,
          sourceWatermarkOrderedID: null,
        },
      }),
    ).toBe(false);
    expect(accountPermitsLegacyWrites(automerge)).toBe(false);
  });

  test("eligible new accounts begin Automerge-only but pending", () => {
    expect(
      newHostedVaultAccountRecord(
        { ...input, mode: "new-automerge" },
        "hosted-a",
      ),
    ).toMatchObject({
      root: { status: "unbound" },
      migration: {
        mode: "automerge",
        source: "new-account",
        cutoverAtTimestampMillis: input.registrationTimestampMillis,
      },
      notificationMode: "pending",
    });
  });
});
