import * as Automerge from "@automerge/automerge";
import {
  parseAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from "@automerge/automerge-repo";
import type { AutomergeDocumentURL } from "@withorbit/core";
import type { AutomergeBinaryStorage } from "./binaryStorage.js";

export class RepoAutomergeBinaryStorage implements AutomergeBinaryStorage {
  private readonly handles = new Map<
    AutomergeDocumentURL,
    DocHandle<unknown>
  >();
  private operation: Promise<unknown> = Promise.resolve();

  constructor(readonly repo: Repo) {}

  async load(documentURL: AutomergeDocumentURL) {
    const handle = await this.handle(documentURL);
    return Automerge.save(handle.fullDoc());
  }

  save(documentURL: AutomergeDocumentURL, bytes: Uint8Array): Promise<void> {
    return this.exclusive(async () => {
      const incoming = Automerge.load(bytes);
      let handle = this.handles.get(documentURL);
      if (!handle) {
        const { documentId } = parseAutomergeUrl(repoURL(documentURL));
        handle = this.repo.import(bytes, { docId: documentId });
        this.handles.set(documentURL, handle);
      } else {
        const merged = Automerge.merge(handle.fullDoc(), incoming);
        handle.update(() => merged);
      }
      await this.repo.flush([handle.documentId]);
    });
  }

  async remove(documentURL: AutomergeDocumentURL) {
    this.handles.delete(documentURL);
    this.repo.delete(repoURL(documentURL));
  }

  async close() {
    await this.operation;
  }

  async handle(documentURL: AutomergeDocumentURL) {
    const existing = this.handles.get(documentURL);
    if (existing) return existing;
    const handle = await this.repo.find(repoURL(documentURL));
    this.handles.set(documentURL, handle);
    return handle;
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

function repoURL(value: AutomergeDocumentURL) {
  return value as unknown as AutomergeUrl;
}
