import * as Automerge from "@automerge/automerge";
import {
  generateAutomergeUrl,
  parseAutomergeUrl,
  type AutomergeUrl,
  type DocHandle,
  type Repo,
} from "@automerge/automerge-repo";
import type { AutomergeDocumentURL, VaultAttachment } from "@withorbit/core";
import type {
  DocumentPatch,
  DocumentSnapshot,
  PerTaskDocuments,
} from "@withorbit/store-shared/perTaskRepository";
import type { AutomergeBinaryStorage } from "./binaryStorage.js";
import {
  decodeAtomicTree,
  decodeAttachmentDocument,
  encodeAtomicTree,
} from "./codec.js";
import {
  verifyAttachmentBytes,
  verifyAttachmentDocument,
} from "./attachmentWriter.js";

/** Normal web access stays on Repo-owned DocHandles, never save/load/merge round trips. */
export class RepoPerTaskDocuments implements PerTaskDocuments {
  private readonly listeners = new Set<(url: AutomergeDocumentURL) => void>();
  private readonly detach = new Map<AutomergeDocumentURL, () => void>();

  constructor(readonly repo: Repo) {}

  async read(
    url: AutomergeDocumentURL,
    options?: { localOnly?: boolean; heads?: readonly string[] },
  ): Promise<DocumentSnapshot | undefined> {
    const id = parseAutomergeUrl(url as unknown as AutomergeUrl).documentId;
    if (options?.localOnly && !this.repo.handles[id]?.isReady()) {
      if (
        !this.repo.storageSubsystem ||
        !(await this.repo.storageSubsystem.loadDocData(id))
      )
        return undefined;
    }
    const doc = (await this.handle(url)).fullDoc();
    return {
      ...snapshot(doc),
      ...(options?.heads
        ? { hasRequestedHeads: Automerge.hasHeads(doc, [...options.heads]) }
        : {}),
    };
  }

  async create(data: unknown, url?: AutomergeDocumentURL) {
    let handle: DocHandle<unknown>;
    if (url) {
      // Explicit IDs are for operational imports/fixtures, not normal task writes.
      const document = Automerge.from(
        encodeAtomicTree(data) as Record<string, Automerge.AutomergeValue>,
      );
      try {
        handle = this.repo.import(Automerge.save(document), {
          docId: parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
        });
      } finally {
        Automerge.free(document);
      }
    } else {
      handle = this.repo.create<unknown>(encodeAtomicTree(data));
      url = handle.url as unknown as AutomergeDocumentURL;
    }
    this.observe(url, handle);
    await this.repo.flush([handle.documentId]);
    return { url, snapshot: snapshot(handle.fullDoc()) };
  }

  async patch(url: AutomergeDocumentURL, patches: readonly DocumentPatch[]) {
    const handle = await this.handle(url);
    handle.change((draft: unknown) => applyPatches(draft, patches));
    await this.repo.flush([handle.documentId]);
  }

  async fetch(url: AutomergeDocumentURL) {
    try {
      await this.handle(url);
      return true;
    } catch {
      return false;
    }
  }

  subscribe(listener: (url: AutomergeDocumentURL) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async readAttachment(attachment: VaultAttachment) {
    const decoded = decodeAttachmentDocument(
      (await this.handle(attachment.documentURL)).fullDoc(),
    );
    return verifyAttachmentBytes({
      bytes: decoded.bytes,
      expectedHash: attachment.hash,
      expectedByteLength: attachment.byteLength,
      expectedMediaType: attachment.mediaType,
    });
  }

  async close() {
    for (const detach of this.detach.values()) detach();
    this.detach.clear();
    this.listeners.clear();
  }

  private async handle(url: AutomergeDocumentURL) {
    const handle = await this.repo.find<unknown>(
      url as unknown as AutomergeUrl,
    );
    this.observe(url, handle);
    return handle;
  }

  private observe(url: AutomergeDocumentURL, handle: DocHandle<unknown>) {
    if (this.detach.has(url)) return;
    const onChange = () => {
      for (const listener of this.listeners) {
        try {
          listener(url);
        } catch {
          /* Projection listeners do not break Repo updates. */
        }
      }
    };
    handle.on("heads-changed", onChange);
    this.detach.set(url, () => handle.off("heads-changed", onChange));
  }
}

/** Byte-backed access for operational import tools and tests, not live Repo clients. */
export class BinaryPerTaskDocuments implements PerTaskDocuments {
  constructor(readonly storage: AutomergeBinaryStorage) {}

  async read(
    url: AutomergeDocumentURL,
    options?: { localOnly?: boolean; heads?: readonly string[] },
  ) {
    const bytes = await this.storage.load(url);
    if (!bytes) return undefined;
    const doc = Automerge.load(bytes);
    try {
      return {
        ...snapshot(doc),
        ...(options?.heads
          ? { hasRequestedHeads: Automerge.hasHeads(doc, [...options.heads]) }
          : {}),
      };
    } finally {
      Automerge.free(doc);
    }
  }

  async create(
    data: unknown,
    url = generateAutomergeUrl() as unknown as AutomergeDocumentURL,
  ) {
    const doc = Automerge.from(
      encodeAtomicTree(data) as Record<string, Automerge.AutomergeValue>,
    );
    try {
      await this.storage.save(url, Automerge.save(doc));
      return { url, snapshot: snapshot(doc) };
    } finally {
      Automerge.free(doc);
    }
  }

  async patch(url: AutomergeDocumentURL, patches: readonly DocumentPatch[]) {
    const bytes = await this.storage.load(url);
    if (!bytes) throw new Error("Automerge document unavailable: " + url);
    let doc = Automerge.load(bytes);
    try {
      doc = Automerge.change(doc, (draft) => applyPatches(draft, patches));
      await this.storage.save(url, Automerge.save(doc));
    } finally {
      Automerge.free(doc);
    }
  }

  async readAttachment(attachment: VaultAttachment) {
    const binary = await this.storage.load(attachment.documentURL);
    if (!binary) throw new Error("Vault attachment document is missing");
    return verifyAttachmentDocument({
      binary,
      expectedHash: attachment.hash,
      expectedByteLength: attachment.byteLength,
      expectedMediaType: attachment.mediaType,
    });
  }

  async close() {
    await this.storage.close?.();
  }
}

export function unwrapDocument(value: unknown): unknown {
  return decodeAtomicTree(value, "$document");
}

function snapshot(doc: Automerge.Doc<unknown>): DocumentSnapshot {
  const conflicts: NonNullable<DocumentSnapshot["conflicts"]> = [];
  function visit(value: unknown, path: string[]) {
    if (
      !value ||
      typeof value !== "object" ||
      Automerge.isImmutableString(value) ||
      value instanceof Uint8Array
    )
      return;
    for (const key of Object.keys(value)) {
      const record = value as Record<string, unknown>;
      const variants = Automerge.getConflicts(
        record as Automerge.Doc<Record<string, unknown>>,
        key,
      );
      if (variants && Object.keys(variants).length > 1)
        conflicts.push({
          path: [...path, key],
          variantCount: Object.keys(variants).length,
        });
      visit(record[key], [...path, key]);
    }
  }
  visit(doc, []);
  return {
    data: unwrapDocument(doc),
    heads: [...Automerge.getHeads(doc)].sort(),
    conflicts,
    conflictCount: conflicts.reduce(
      (count, { variantCount }) => count + variantCount - 1,
      0,
    ),
  };
}

function applyPatches(draft: unknown, patches: readonly DocumentPatch[]) {
  for (const patch of patches) {
    if (!patch.path.length)
      throw new Error("Cannot replace an entire Automerge document");
    let parent = draft as Record<string, unknown>;
    for (const key of patch.path.slice(0, -1)) {
      const child = parent[key];
      if (!child || typeof child !== "object")
        throw new Error("Patch parent is missing");
      parent = child as Record<string, unknown>;
    }
    const key = patch.path[patch.path.length - 1];
    if (patch.kind === "delete") delete parent[key];
    else parent[key] = encodeAtomicTree(patch.value);
  }
}
