import { generateUniqueID, type AutomergeDocumentURL } from "@withorbit/core";

/** The only vault this installation opens. Never consult the public registry. */
export interface LabConnection {
  serviceOrigin: string;
  token: string;
  rootDocumentURL: AutomergeDocumentURL;
  localStoreID: string;
}

export function normalizeLabOrigin(value: string): string {
  const url = new URL(value.trim());
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Use a private HTTPS origin, or HTTP on localhost.");
  }
  return url.origin;
}

export interface LabConnectionStorage {
  load(): Promise<string | null>;
  save(value: string): Promise<void>;
}

export class LabConnectionManager {
  constructor(private readonly storage: LabConnectionStorage) {}

  async load(): Promise<LabConnection | null> {
    const serialized = await this.storage.load();
    if (serialized === null) return null;
    const value = JSON.parse(serialized) as Partial<LabConnection>;
    if (
      typeof value.serviceOrigin !== "string" ||
      typeof value.token !== "string" ||
      !value.token.trim() ||
      typeof value.rootDocumentURL !== "string" ||
      !value.rootDocumentURL.startsWith("automerge:") ||
      typeof value.localStoreID !== "string" ||
      !/^lab-[0-9A-Za-z_-]{22}$/.test(value.localStoreID)
    ) {
      throw new Error("The saved Lab connection is invalid. Pair again.");
    }
    return {
      ...value,
      serviceOrigin: normalizeLabOrigin(value.serviceOrigin),
    } as LabConnection;
  }

  /** First pairing is explicit and chooses fresh, independent device storage. */
  async pair(input: {
    serviceOrigin: string;
    token: string;
    rootDocumentURL: AutomergeDocumentURL;
  }): Promise<LabConnection> {
    if (
      !input.token.trim() ||
      !input.rootDocumentURL.startsWith("automerge:")
    ) {
      throw new Error("Invalid Lab pairing response.");
    }
    // Explicit pairing can replace a malformed selection record, not vault data.
    const existing = await this.load().catch(() => null);
    const serviceOrigin = normalizeLabOrigin(input.serviceOrigin);
    const sameVault =
      existing?.serviceOrigin === serviceOrigin &&
      existing.rootDocumentURL === input.rootDocumentURL;
    const connection: LabConnection = {
      serviceOrigin,
      token: input.token.trim(),
      rootDocumentURL: input.rootDocumentURL,
      localStoreID: sameVault
        ? existing.localStoreID
        : `lab-${generateUniqueID()}`,
    };
    await this.storage.save(JSON.stringify(connection));
    return connection;
  }
}

export class MemoryLabConnectionStorage implements LabConnectionStorage {
  constructor(private value: string | null = null) {}
  async load() {
    return this.value;
  }
  async save(value: string) {
    this.value = value;
  }
}
