import type { AutomergeDocumentURL } from "@withorbit/core";

/** Portable document codec boundary used by the core store and its tests. */
export interface AutomergeBinaryStorage {
  load(documentURL: AutomergeDocumentURL): Promise<Uint8Array | undefined>;
  save(documentURL: AutomergeDocumentURL, bytes: Uint8Array): Promise<void>;
  remove?(documentURL: AutomergeDocumentURL): Promise<void>;
  close?(): Promise<void>;
}

export class MemoryAutomergeBinaryStorage implements AutomergeBinaryStorage {
  private readonly documents = new Map<AutomergeDocumentURL, Uint8Array>();

  async load(
    documentURL: AutomergeDocumentURL,
  ): Promise<Uint8Array | undefined> {
    const bytes = this.documents.get(documentURL);
    return bytes ? new Uint8Array(bytes) : undefined;
  }

  async save(
    documentURL: AutomergeDocumentURL,
    bytes: Uint8Array,
  ): Promise<void> {
    this.documents.set(documentURL, new Uint8Array(bytes));
  }

  async remove(documentURL: AutomergeDocumentURL): Promise<void> {
    this.documents.delete(documentURL);
  }

  get documentCount(): number {
    return this.documents.size;
  }
}
