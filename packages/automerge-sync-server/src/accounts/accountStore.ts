import type { HostedVaultAccountRecord } from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";

/** Internal transaction result; clients only resolve server-owned roots. */
export interface BindOrResolveRootResult {
  accountID: string;
  disposition: "bound-proposed" | "existing-root";
  binding: Extract<HostedVaultAccountRecord["root"], { status: "bound" }>;
}

export type HostedAccountErrorCode =
  | "account-not-provisioned"
  | "legacy-account"
  | "root-not-bound"
  | "invalid-account-record";

export class HostedAccountError extends Error {
  readonly name = "HostedAccountError";

  constructor(readonly code: HostedAccountErrorCode) {
    super(`Hosted vault account rejected: ${code}`);
  }
}

export interface HostedVaultAccountStore {
  getBySubject(subject: string): Promise<HostedVaultAccountRecord | null>;
  bindOrResolveRoot(input: {
    subject: string;
    issuer: string;
    proposedRootDocumentURL: AutomergeDocumentURL;
    nowTimestampMillis: number;
  }): Promise<BindOrResolveRootResult>;
}

export function accountPermitsHostedSync(record: HostedVaultAccountRecord) {
  return record.migration.mode === "automerge";
}

export function requireHostedAccount(
  record: HostedVaultAccountRecord | null,
): HostedVaultAccountRecord {
  if (!record) throw new HostedAccountError("account-not-provisioned");
  return record;
}

export function assertAccountIdentity(
  record: HostedVaultAccountRecord,
  identity: { subject: string; issuer: string },
) {
  if (
    record.authSubject !== identity.subject ||
    record.authIssuer !== identity.issuer
  ) {
    throw new Error("Hosted account identity mismatch");
  }
}

export function requireBoundHostedAccount(
  record: HostedVaultAccountRecord | null,
): HostedVaultAccountRecord & {
  root: Extract<HostedVaultAccountRecord["root"], { status: "bound" }>;
} {
  const account = requireHostedAccount(record);
  if (!accountPermitsHostedSync(account)) {
    throw new HostedAccountError("legacy-account");
  }
  if (account.root.status !== "bound") {
    throw new HostedAccountError("root-not-bound");
  }
  return account as HostedVaultAccountRecord & {
    root: Extract<HostedVaultAccountRecord["root"], { status: "bound" }>;
  };
}
