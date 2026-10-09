import type { HostedVaultAccountRecord } from "@withorbit/api";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";
import type { Firestore } from "firebase-admin/firestore";
import {
  accountPermitsHostedSync,
  assertAccountIdentity,
  HostedAccountError,
  requireHostedAccount,
  type HostedVaultAccountStore,
} from "./accountStore.js";
export const hostedVaultAccountsCollection = "hostedVaultAccounts";

export class FirestoreHostedVaultAccountStore implements HostedVaultAccountStore {
  constructor(private readonly firestore: Firestore) {}

  async getBySubject(subject: string) {
    const snapshot = await this.accountReference(subject).get();
    return decodeAccount(snapshot.data(), subject);
  }

  bindOrResolveRoot(
    input: Parameters<HostedVaultAccountStore["bindOrResolveRoot"]>[0],
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.accountReference(input.subject);
      const record = requireHostedAccount(
        decodeAccount((await transaction.get(reference)).data(), input.subject),
      );
      assertAccountIdentity(record, input);
      if (!accountPermitsHostedSync(record)) {
        throw new HostedAccountError("legacy-account");
      }
      if (record.root.status === "bound") {
        return {
          accountID: record.hostedVaultID,
          disposition: "existing-root" as const,
          binding: record.root,
        };
      }
      const binding = {
        status: "bound" as const,
        documentURL: input.proposedRootDocumentURL,
        boundAtTimestampMillis: input.nowTimestampMillis,
      };
      transaction.set(reference, { root: binding }, { merge: true });
      return {
        accountID: record.hostedVaultID,
        disposition: "bound-proposed" as const,
        binding,
      };
    });
  }

  private accountReference(subject: string) {
    return this.firestore.doc(
      `${hostedVaultAccountsCollection}/${encodeURIComponent(subject)}`,
    );
  }
}

function decodeAccount(
  value: unknown,
  expectedSubject: string,
): HostedVaultAccountRecord | null {
  if (value === undefined) return null;
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.authIssuer !== "string" ||
    !value.authIssuer.startsWith("https://") ||
    value.authSubject !== expectedSubject ||
    !boundedOpaqueID(value.authSubject) ||
    (value.emailAddress !== null &&
      (typeof value.emailAddress !== "string" ||
        value.emailAddress.length > 320)) ||
    !Number.isSafeInteger(value.registrationTimestampMillis) ||
    !boundedOpaqueID(value.hostedVaultID) ||
    !isRecord(value.root) ||
    (value.root.status !== "unbound" && value.root.status !== "bound") ||
    !validMigration(value.migration) ||
    (value.notificationMode !== "legacy" &&
      value.notificationMode !== "pending" &&
      value.notificationMode !== "server")
  ) {
    throw new HostedAccountError("invalid-account-record");
  }
  if (
    value.root.status === "bound" &&
    (typeof value.root.documentURL !== "string" ||
      !isValidAutomergeUrl(value.root.documentURL) ||
      !Number.isSafeInteger(value.root.boundAtTimestampMillis))
  ) {
    throw new HostedAccountError("invalid-account-record");
  }
  return value as unknown as HostedVaultAccountRecord;
}

function validMigration(value: unknown) {
  if (!isRecord(value) || typeof value.mode !== "string") return false;
  if (value.mode === "legacy") return true;
  if (value.mode === "migrating") {
    return (
      boundedOpaqueID(value.jobID) &&
      Number.isSafeInteger(value.startedAtTimestampMillis) &&
      (value.sourceWatermarkOrderedID === null ||
        boundedOpaqueID(value.sourceWatermarkOrderedID))
    );
  }
  if (value.mode === "automerge") {
    return (
      (value.source === "new-account" || value.source === "legacy-cutover") &&
      Number.isSafeInteger(value.cutoverAtTimestampMillis) &&
      (value.rollbackUntilTimestampMillis === null ||
        Number.isSafeInteger(value.rollbackUntilTimestampMillis)) &&
      (value.legacyArchiveKey === null ||
        typeof value.legacyArchiveKey === "string")
    );
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedOpaqueID(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[\x21-\x7e]+$/.test(value)
  );
}
