import type { HostedVaultAccountRecord } from "@withorbit/api";
import {
  accountPermitsHostedSync,
  assertAccountIdentity,
  HostedAccountError,
  requireHostedAccount,
  type HostedVaultAccountStore,
} from "./accountStore.js";

export class InMemoryHostedVaultAccountStore implements HostedVaultAccountStore {
  private operation: Promise<unknown> = Promise.resolve();
  private readonly records = new Map<string, HostedVaultAccountRecord>();
  constructor(records: readonly HostedVaultAccountRecord[] = []) {
    for (const record of records) {
      this.records.set(record.authSubject, structuredClone(record));
    }
  }

  async getBySubject(subject: string) {
    const record = this.records.get(subject);
    return record ? structuredClone(record) : null;
  }

  bindOrResolveRoot(
    input: Parameters<HostedVaultAccountStore["bindOrResolveRoot"]>[0],
  ) {
    return this.exclusive(async () => {
      const record = requireHostedAccount(
        this.records.get(input.subject) ?? null,
      );
      assertAccountIdentity(record, input);
      if (!accountPermitsHostedSync(record)) {
        throw new HostedAccountError("legacy-account");
      }
      if (record.root.status === "bound") {
        return {
          accountID: record.hostedVaultID,
          disposition: "existing-root" as const,
          binding: structuredClone(record.root),
        };
      }
      record.root = {
        status: "bound",
        documentURL: input.proposedRootDocumentURL,
        boundAtTimestampMillis: input.nowTimestampMillis,
      };
      this.records.set(input.subject, record);
      return {
        accountID: record.hostedVaultID,
        disposition: "bound-proposed" as const,
        binding: structuredClone(record.root),
      };
    });
  }

  set(record: HostedVaultAccountRecord) {
    this.records.set(record.authSubject, structuredClone(record));
  }

  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
