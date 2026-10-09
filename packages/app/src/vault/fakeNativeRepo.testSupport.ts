import * as Automerge from "@automerge/automerge";
import {
  stringifyAutomergeUrl,
  type BinaryDocumentId,
} from "@automerge/automerge-repo";
import type { AutomergeDocumentURL } from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  decodeAttachmentDocument,
  type AutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { NativePerTaskDocuments } from "./nativePerTaskDocuments.js";
import type {
  NativeRepoDocumentChangedEvent,
  OrbitAutomergeNativeModule,
} from "./orbitAutomergeNative.js";

/** A test bridge implementing the same Repo-session methods as Swift. */
export function fakeNativeRepo(storage: AutomergeBinaryStorage) {
  const documentListeners = new Set<
    (event: NativeRepoDocumentChangedEvent) => void
  >();
  const emitDocumentChange = (event: NativeRepoDocumentChangedEvent) => {
    for (const listener of documentListeners) listener(event);
  };
  const documents = new BinaryPerTaskDocuments(storage);
  const materialize = async (url: string) => {
    const snapshot = await documents.read(url as AutomergeDocumentURL);
    if (!snapshot) throw new Error("Native document unavailable");
    return {
      json: JSON.stringify(snapshot.data),
      heads: snapshot.heads,
      conflicts: snapshot.conflicts ?? [],
      conflictCount: snapshot.conflictCount ?? 0,
    };
  };
  const native = {
    addListener(
      eventName: string,
      listener: (event: NativeRepoDocumentChangedEvent) => void,
    ) {
      if (eventName !== "onRepoDocumentChanged")
        throw new Error("This fixture implements document events only");
      documentListeners.add(listener);
      return { remove: () => documentListeners.delete(listener) };
    },
    async closeRepo() {},
    async repoDocumentsExist(_storeID: string, urls: string[]) {
      return Promise.all(
        urls.map(async (url) =>
          Boolean(await storage.load(url as AutomergeDocumentURL)),
        ),
      );
    },
    async materializeRepoDocument(_storeID: string, url: string) {
      return materialize(url);
    },
    async materializeRepoDocuments(_storeID: string, urls: string[]) {
      return Promise.all(urls.map(materialize));
    },
    async repoDocumentHasHeads(_storeID: string, url: string, heads: string[]) {
      return (
        (await documents.read(url as AutomergeDocumentURL, { heads }))
          ?.hasRequestedHeads ?? false
      );
    },
    async applyRepoPatch(_storeID: string, url: string, json: string) {
      await documents.patch(url as AutomergeDocumentURL, JSON.parse(json));
      emitDocumentChange({ localStoreID: _storeID, documentURL: url });
    },
    async createRepoDocument(
      _storeID: string,
      json: string,
      url: string | null,
    ) {
      const created = await documents.create(
        JSON.parse(json),
        (url ?? undefined) as AutomergeDocumentURL | undefined,
      );
      emitDocumentChange({ localStoreID: _storeID, documentURL: created.url });
      return { documentURL: created.url, ...(await materialize(created.url)) };
    },
    async readRepoAttachment(_storeID: string, url: string) {
      const bytes = await storage.load(url as AutomergeDocumentURL);
      if (!bytes) throw new Error("Native attachment document is missing");
      const doc = Automerge.load(bytes);
      try {
        const result = decodeAttachmentDocument(doc);
        const digest = new Uint8Array(
          await crypto.subtle.digest("SHA-256", Uint8Array.from(result.bytes)),
        );
        return {
          bytes: result.bytes,
          sha256Hex: [...digest]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(""),
          documentURL: stringifyAutomergeUrl({
            documentId: digest.slice(0, 16) as BinaryDocumentId,
          }),
        };
      } finally {
        Automerge.free(doc);
      }
    },
  } as unknown as OrbitAutomergeNativeModule;
  return Object.assign(new NativePerTaskDocuments("test-repo", native), {
    emitDocumentChange,
    documentListenerCount: () => documentListeners.size,
  });
}
