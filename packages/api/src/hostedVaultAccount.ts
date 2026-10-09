import type { AutomergeDocumentURL } from "@withorbit/core";

export type HostedRootBinding =
  | { status: "unbound" }
  | {
      status: "bound";
      documentURL: AutomergeDocumentURL;
      boundAtTimestampMillis: number;
    };

export type HostedVaultMigrationState =
  | { mode: "legacy" }
  | {
      mode: "migrating";
      jobID: string;
      startedAtTimestampMillis: number;
      sourceWatermarkOrderedID: string | null;
    }
  | {
      mode: "automerge";
      source: "new-account" | "legacy-cutover";
      cutoverAtTimestampMillis: number;
      rollbackUntilTimestampMillis: number | null;
      legacyArchiveKey: string | null;
    };

export interface HostedVaultAccountRecord {
  schemaVersion: 1;
  authIssuer: string;
  authSubject: string;
  emailAddress: string | null;
  registrationTimestampMillis: number;
  /** Opaque namespace used for Repo storage and service metrics. */
  hostedVaultID: string;
  root: HostedRootBinding;
  migration: HostedVaultMigrationState;
  introEmail?: {
    status: "pending" | "sent" | "failed";
    attemptCount: number;
    sentAtTimestampMillis?: number;
    lastError?: string;
  };
  /** Reminder authority; pending accounts require explicit server enrollment. */
  notificationMode: "legacy" | "pending" | "server";
}
