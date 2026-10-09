import { randomUUID } from "node:crypto";
import type { HostedVaultAccountRecord } from "@withorbit/api";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { getDatabase } from "./firestore.js";

export const hostedVaultAccountsCollection = "hostedVaultAccounts";

export type HostedAccountProvisioningMode = "legacy" | "new-automerge";

export interface HostedAccountProvisioningInput {
  authIssuer: string;
  authSubject: string;
  emailAddress: string | null;
  registrationTimestampMillis: number;
  mode: HostedAccountProvisioningMode;
}

/**
 * Creates, but never replaces, an account control record. This makes the
 * account-creation trigger and an explicit account migration safe to race, and
 * prevents a retry from erasing a root bound by the sync service.
 */
export async function provisionHostedVaultAccount(
  input: HostedAccountProvisioningInput,
  database: Firestore = getDatabase(),
): Promise<"created" | "existing"> {
  assertValidHostedAccountProvisioningInput(input);
  return database.runTransaction(async (transaction) => {
    const reference = hostedVaultAccountReference(database, input.authSubject);
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      const existing = snapshot.data();
      if (
        existing?.authSubject !== input.authSubject ||
        existing?.authIssuer !== input.authIssuer
      ) {
        throw new Error("Hosted account identity does not match provisioning");
      }
      return "existing";
    }
    transaction.create(reference, newHostedVaultAccountRecord(input));
    return "created";
  });
}

export function newHostedVaultAccountRecord(
  input: HostedAccountProvisioningInput,
  hostedVaultID = randomUUID(),
): HostedVaultAccountRecord {
  assertValidHostedAccountProvisioningInput(input);
  return {
    schemaVersion: 1,
    authIssuer: input.authIssuer,
    authSubject: input.authSubject,
    emailAddress: input.emailAddress,
    registrationTimestampMillis: input.registrationTimestampMillis,
    hostedVaultID,
    root: { status: "unbound" },
    migration:
      input.mode === "legacy"
        ? { mode: "legacy" }
        : {
            mode: "automerge",
            source: "new-account",
            cutoverAtTimestampMillis: input.registrationTimestampMillis,
            rollbackUntilTimestampMillis: null,
            legacyArchiveKey: null,
          },
    notificationMode: input.mode === "legacy" ? "legacy" : "pending",
  };
}

export async function getHostedVaultAccount(
  authSubject: string,
  database: Firestore = getDatabase(),
): Promise<HostedVaultAccountRecord | null> {
  const snapshot = await hostedVaultAccountReference(
    database,
    authSubject,
  ).get();
  return snapshot.exists ? (snapshot.data() as HostedVaultAccountRecord) : null;
}

export class LegacyWritesDisabledError extends Error {
  constructor() {
    super("Legacy writes are disabled for this account");
    this.name = "LegacyWritesDisabledError";
  }
}

/**
 * Missing records predate the hosted-account provisioning pass and must remain
 * writable. Once a record exists, fail closed unless it is explicitly legacy.
 */
export function accountPermitsLegacyWrites(
  account: Pick<HostedVaultAccountRecord, "migration"> | null,
) {
  return account === null || account.migration.mode === "legacy";
}

export async function legacyWritesPermitted(
  authSubject: string,
  database: Firestore = getDatabase(),
) {
  const snapshot = await hostedVaultAccountReference(
    database,
    authSubject,
  ).get();
  if (!snapshot.exists) return true;
  const value = snapshot.data();
  return value?.migration?.mode === "legacy";
}

/**
 * Called inside the same transaction which writes legacy events, closing the
 * race between the migration freeze and an already-admitted HTTP request.
 */
export async function assertLegacyWritesPermittedInTransaction(
  authSubject: string,
  transaction: Transaction,
  database: Firestore = getDatabase(),
) {
  const snapshot = await transaction.get(
    hostedVaultAccountReference(database, authSubject),
  );
  if (snapshot.exists && snapshot.data()?.migration?.mode !== "legacy") {
    throw new LegacyWritesDisabledError();
  }
}

export async function isLegacyNotificationAuthoritative(
  authSubject: string,
  database: Firestore = getDatabase(),
) {
  const account = await getHostedVaultAccount(authSubject, database);
  return account === null || account.notificationMode === "legacy";
}

export function hostedVaultAccountReference(
  database: Firestore,
  authSubject: string,
) {
  if (!authSubject || authSubject.length > 128) {
    throw new Error("Invalid hosted account auth subject");
  }
  return database
    .collection(hostedVaultAccountsCollection)
    .doc(encodeURIComponent(authSubject));
}

export function assertValidHostedAccountProvisioningInput(
  input: HostedAccountProvisioningInput,
) {
  if (
    !input.authIssuer.startsWith("https://") ||
    !input.authSubject ||
    input.authSubject.length > 128 ||
    (input.emailAddress !== null && !input.emailAddress) ||
    !Number.isSafeInteger(input.registrationTimestampMillis) ||
    !["legacy", "new-automerge"].includes(input.mode)
  ) {
    throw new Error("Invalid hosted account provisioning input");
  }
}
