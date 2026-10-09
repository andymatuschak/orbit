import type {
  HostedVaultAccountRecord,
  ResolveHostedRootResponse,
} from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";
import {
  accountPermitsHostedSync,
  assertAccountIdentity,
  HostedAccountError,
  requireHostedAccount,
  type HostedVaultAccountStore,
} from "../accounts/accountStore.js";
import type { VerifiedFirebasePrincipal } from "../auth/firebaseIDTokenVerifier.js";

export async function resolveRoot(input: {
  body: unknown;
  principal: VerifiedFirebasePrincipal;
  accounts: HostedVaultAccountStore;
  createRoot(account: HostedVaultAccountRecord): Promise<AutomergeDocumentURL>;
  nowTimestampMillis: number;
}): Promise<ResolveHostedRootResponse> {
  if (!isRecord(input.body) || Object.keys(input.body).length !== 0) {
    throw new TypeError("Hosted-root resolve body must be an empty object");
  }
  const account = requireHostedAccount(
    await input.accounts.getBySubject(input.principal.subject),
  );
  assertAccountIdentity(account, input.principal);
  if (!accountPermitsHostedSync(account)) {
    throw new HostedAccountError("legacy-account");
  }
  if (account.root.status === "unbound") {
    // Only new accounts receive an empty vault. A migrated account whose
    // binding is absent needs recovery, not a silently empty replacement.
    if (
      account.migration.mode !== "automerge" ||
      account.migration.source !== "new-account"
    ) {
      throw new HostedAccountError("root-not-bound");
    }
    // The factory must finish durable storage before publishing the binding.
    // The account-store transaction elects one sticky root if resolves race.
    const proposedRootDocumentURL = await input.createRoot(account);
    const resolved = await input.accounts.bindOrResolveRoot({
      ...input.principal,
      proposedRootDocumentURL,
      nowTimestampMillis: input.nowTimestampMillis,
    });
    return {
      accountID: resolved.accountID,
      rootDocumentURL: resolved.binding.documentURL,
    };
  }
  return {
    accountID: account.hostedVaultID,
    rootDocumentURL: account.root.documentURL,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
