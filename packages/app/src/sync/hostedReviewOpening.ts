import type {
  HostedSyncCredential,
  ResolveHostedRootResponse,
} from "@withorbit/api";
import type { HostedVaultRegistryEntry } from "../vault/vaultRegistry.js";
import {
  HostedVaultClient,
  HostedVaultControlError,
  HostedVaultHTTPClient,
} from "./HostedVaultClient.js";
import type { OpenHostedReviewDatabaseInput } from "./openHostedReviewDatabase.types.js";

export interface HostedReviewControlClient {
  resolveHostedRoot(): Promise<ResolveHostedRootResponse>;
  getSyncCredential(): Promise<HostedSyncCredential>;
}

export type HostedReviewOpening =
  | { kind: "legacy" }
  | {
      kind: "open-bound";
      control: HostedReviewControlClient;
      entry: HostedVaultRegistryEntry;
    };

/** Resolves the platform-independent account, root, and vault-selection flow. */
export async function prepareHostedReviewOpening(
  input: OpenHostedReviewDatabaseInput,
  dependencies: {
    controlClient?: HostedReviewControlClient;
    sleep?: (delayMillis: number) => Promise<void>;
  },
): Promise<HostedReviewOpening> {
  const control =
    dependencies.controlClient ??
    new HostedVaultClient(
      new HostedVaultHTTPClient(input.serviceOrigin),
      input.authenticationClient,
      input.accountID,
    );
  const registry = await input.registry.getRegistry();
  const cachedEntry = registry.hostedVaults.find(
    (entry) =>
      entry.authenticationUserID === input.accountID &&
      entry.serviceOrigin === input.serviceOrigin,
  );
  if (cachedEntry) {
    // iOS may show this device's sole selected cache before Firebase restores
    // its user. Auth still gates sync credentials; the route removes this vault
    // if Firebase resolves to another user or to a signed-out state.
    if (!input.allowCachedBeforeAuth) {
      await requireAccountIdentity(input);
    }
    return {
      kind: "open-bound",
      control,
      entry: cachedEntry,
    };
  }
  await requireAccountIdentity(input);
  const sleep = dependencies.sleep ?? defaultSleep;
  let root: ResolveHostedRootResponse;
  try {
    root = await afterProvisioningSettles(
      () => control.resolveHostedRoot(),
      sleep,
    );
  } catch (error) {
    if (isHostedControlError(error, "legacy-account")) {
      return { kind: "legacy" };
    }
    throw error;
  }
  const entry = await input.registry.getOrCreateHostedAccountVault({
    authenticationUserID: input.accountID,
    accountID: root.accountID,
    serviceOrigin: input.serviceOrigin,
    rootDocumentURL: root.rootDocumentURL,
  });
  return { kind: "open-bound", control, entry };
}

async function requireAccountIdentity(input: OpenHostedReviewDatabaseInput) {
  const user = await input.authenticationClient.getUserAuthState();
  if (user?.userID !== input.accountID) {
    throw new Error("Authenticated account changed while opening its vault");
  }
}

async function afterProvisioningSettles<T>(
  operation: () => Promise<T>,
  sleep: (delayMillis: number) => Promise<void>,
): Promise<T> {
  const retryDelaysMillis = [100, 250, 500, 1_000, 2_000, 4_000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const delay = retryDelaysMillis[attempt];
      if (
        !isHostedControlError(error, "account-not-provisioned") ||
        delay === undefined
      ) {
        throw error;
      }
      await sleep(delay);
    }
  }
}

function isHostedControlError(
  value: unknown,
  code: HostedVaultControlError["code"],
) {
  return value instanceof HostedVaultControlError && value.code === code;
}

function defaultSleep(delayMillis: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMillis));
}
