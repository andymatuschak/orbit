import { generateUniqueID, type AutomergeDocumentURL } from "@withorbit/core";

/** Device-local cache coordinates for one hosted account. */
export interface HostedVaultRegistryEntry {
  rootDocumentURL: AutomergeDocumentURL;
  localStoreID: string;
  kind: "hosted";
  /** Firebase user whose authenticated control response established this cache. */
  authenticationUserID: string;
  accountID: string;
  serviceOrigin: string;
}

export interface VaultRegistry {
  schemaVersion: 2;
  hostedVaults: HostedVaultRegistryEntry[];
}

/** A persisted cache can stand in for auth only when it selects one account. */
export function selectCachedHostedReviewAccount(
  registry: VaultRegistry,
  serviceOrigin: string,
  isEligible: (authenticationUserID: string) => boolean,
): string | null {
  const candidates = registry.hostedVaults.filter(
    (entry) =>
      entry.serviceOrigin === serviceOrigin &&
      isEligible(entry.authenticationUserID),
  );
  return candidates.length === 1 ? candidates[0].authenticationUserID : null;
}

export interface VaultRegistryStorage {
  load(): Promise<string | null>;
  save(serializedRegistry: string): Promise<void>;
}

/**
 * Stores only device-local cache coordinates. Logical vault identity lives in
 * the Automerge catalog, and the server remains authoritative for account to
 * root bindings.
 */
export class VaultRegistryManager {
  private operation: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: VaultRegistryStorage) {}

  getRegistry(): Promise<VaultRegistry> {
    return this.exclusive(() => this.load());
  }

  getOrCreateHostedAccountVault(input: {
    authenticationUserID: string;
    accountID: string;
    serviceOrigin: string;
    rootDocumentURL: AutomergeDocumentURL;
  }): Promise<HostedVaultRegistryEntry> {
    return this.exclusive(async () => {
      const registry = await this.load();
      const existing = registry.hostedVaults.find(
        (entry) =>
          entry.accountID === input.accountID &&
          entry.serviceOrigin === input.serviceOrigin,
      );
      if (existing) {
        if (existing.rootDocumentURL !== input.rootDocumentURL) {
          throw new Error("Hosted account root changed unexpectedly");
        }
        if (existing.authenticationUserID !== input.authenticationUserID) {
          throw new Error("Hosted account authentication identity changed");
        }
        return existing;
      }

      const entry: HostedVaultRegistryEntry = {
        kind: "hosted",
        authenticationUserID: input.authenticationUserID,
        accountID: input.accountID,
        serviceOrigin: input.serviceOrigin,
        rootDocumentURL: input.rootDocumentURL,
        localStoreID: newLocalStoreID(),
      };
      registry.hostedVaults.push(entry);
      await this.save(registry);
      return entry;
    });
  }

  private async load(): Promise<VaultRegistry> {
    const serialized = await this.storage.load();
    if (serialized === null) return emptyVaultRegistry();
    const registry = JSON.parse(serialized) as unknown;
    assertVaultRegistry(registry);
    return { schemaVersion: 2, hostedVaults: registry.hostedVaults };
  }

  private save(registry: VaultRegistry): Promise<void> {
    assertVaultRegistry(registry);
    return this.storage.save(JSON.stringify(registry));
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

export class MemoryVaultRegistryStorage implements VaultRegistryStorage {
  constructor(private value: string | null = null) {}

  async load(): Promise<string | null> {
    return this.value;
  }

  async save(serializedRegistry: string): Promise<void> {
    this.value = serializedRegistry;
  }
}

export function emptyVaultRegistry(): VaultRegistry {
  return {
    schemaVersion: 2,
    hostedVaults: [],
  };
}

function assertVaultRegistry(value: unknown): asserts value is VaultRegistry {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !Array.isArray(value.hostedVaults)
  ) {
    throw new Error("Unknown or malformed vault registry");
  }
  const accountKeys = new Set<string>();
  for (const entry of value.hostedVaults) {
    if (!isHostedEntry(entry)) {
      throw new Error("Malformed hosted vault registry entry");
    }
    const key = `${entry.serviceOrigin}\0${entry.accountID}`;
    if (accountKeys.has(key)) {
      throw new Error("Duplicate hosted account registry entry");
    }
    accountKeys.add(key);
  }
}

function isHostedEntry(value: unknown): value is HostedVaultRegistryEntry {
  return (
    isRecord(value) &&
    value.kind === "hosted" &&
    typeof value.authenticationUserID === "string" &&
    typeof value.accountID === "string" &&
    typeof value.serviceOrigin === "string" &&
    isLocalVaultEntry(value)
  );
}

function isLocalVaultEntry(value: Record<string, unknown>) {
  return (
    typeof value.rootDocumentURL === "string" &&
    value.rootDocumentURL.startsWith("automerge:") &&
    isValidLocalStoreID(value.localStoreID)
  );
}

function newLocalStoreID() {
  return `vault-${generateUniqueID()}`;
}

function isValidLocalStoreID(value: unknown): value is string {
  return typeof value === "string" && /^vault-[0-9A-Za-z_-]{22}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
