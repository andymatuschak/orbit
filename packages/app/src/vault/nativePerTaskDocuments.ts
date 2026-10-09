import type { AutomergeDocumentURL, VaultAttachment } from "@withorbit/core";
import type {
  DocumentPatch,
  DocumentSnapshot,
  PerTaskDocuments,
} from "@withorbit/store-shared/perTaskRepository";
import { canonicalJSONString } from "@withorbit/store-shared/taskMutationPlanner";
import type { EventSubscription } from "expo-modules-core";
import type { NativeHostedSyncTransport } from "../sync/NativeHostedSyncTransport.js";
import type {
  NativeMaterializedDocument,
  OrbitAutomergeNativeModule,
} from "./orbitAutomergeNative.js";

/** Repo Swift access/admission; schema and catalog policy are shared with web. */
export class NativePerTaskDocuments implements PerTaskDocuments {
  private isClosed = false;
  private readonly subscriptions = new Set<EventSubscription>();

  constructor(
    readonly localStoreID: string,
    readonly native: OrbitAutomergeNativeModule,
    public transport: NativeHostedSyncTransport | null = null,
  ) {}

  subscribe(listener: (url: AutomergeDocumentURL) => void) {
    this.assertOpen();
    const subscription = this.native.addListener(
      "onRepoDocumentChanged",
      (event) => {
        if (
          !this.isClosed &&
          event.localStoreID === this.localStoreID &&
          event.documentURL.startsWith("automerge:")
        )
          listener(event.documentURL as AutomergeDocumentURL);
      },
    );
    this.subscriptions.add(subscription);
    return () => {
      if (this.subscriptions.delete(subscription)) subscription.remove();
    };
  }

  containsMany(urls: readonly AutomergeDocumentURL[]): Promise<boolean[]> {
    this.assertOpen();
    return this.native.repoDocumentsExist(this.localStoreID, [...urls]);
  }

  materialize(url: AutomergeDocumentURL) {
    this.assertOpen();
    return this.native.materializeRepoDocument(this.localStoreID, url);
  }

  materializeMany(urls: readonly AutomergeDocumentURL[]) {
    this.assertOpen();
    return this.native.materializeRepoDocuments(this.localStoreID, [...urls]);
  }

  async read(
    url: AutomergeDocumentURL,
    options?: { localOnly?: boolean; heads?: readonly string[] },
  ) {
    if (!(await this.containsMany([url]))[0]) {
      if (options?.localOnly || !(await this.transport?.ensureDocument(url)))
        return undefined;
    }
    return {
      ...nativeSnapshot(await this.materialize(url)),
      ...(options?.heads
        ? {
            hasRequestedHeads: await this.native.repoDocumentHasHeads(
              this.localStoreID,
              url,
              options.heads,
            ),
          }
        : {}),
    };
  }

  async readMany(
    urls: readonly AutomergeDocumentURL[],
    options?: { localOnly?: boolean },
  ) {
    const present = await this.containsMany(urls);
    if (options?.localOnly) {
      const local = urls.filter((_, index) => present[index]);
      const snapshots = (await this.materializeMany(local)).map(nativeSnapshot);
      let index = 0;
      return present.map((exists) => (exists ? snapshots[index++] : undefined));
    }
    const missing = urls.filter((_, index) => !present[index]);
    if (missing.length) {
      const available = await this.transport?.ensureDocuments(missing);
      if (!available || available.some((value) => !value))
        throw new Error("Hosted Automerge task document is unavailable");
    }
    return (await this.materializeMany(urls)).map(nativeSnapshot);
  }

  async create(data: unknown, url?: AutomergeDocumentURL) {
    this.assertOpen();
    const created = await this.native.createRepoDocument(
      this.localStoreID,
      canonicalJSONString(data),
      url ?? null,
    );
    return {
      url: created.documentURL as AutomergeDocumentURL,
      snapshot: nativeSnapshot(created),
    };
  }

  async patch(url: AutomergeDocumentURL, patches: readonly DocumentPatch[]) {
    this.assertOpen();
    return this.native.applyRepoPatch(
      this.localStoreID,
      url,
      canonicalJSONString(patches),
    );
  }

  async fetch(url: AutomergeDocumentURL) {
    this.assertOpen();
    return (await this.transport?.ensureDocument(url)) ?? false;
  }

  async readAttachment(attachment: VaultAttachment) {
    if (
      !(await this.containsMany([attachment.documentURL]))[0] &&
      !(await this.transport?.ensureDocument(attachment.documentURL))
    )
      throw new Error("Native attachment document is missing");
    const materialized = await this.native.readRepoAttachment(
      this.localStoreID,
      attachment.documentURL,
    );
    if (
      "sha256:" + materialized.sha256Hex !== attachment.hash ||
      materialized.documentURL !== attachment.documentURL ||
      materialized.bytes.byteLength !== attachment.byteLength
    )
      throw new Error("Native attachment document failed integrity checks");
    return {
      bytes: materialized.bytes,
      mediaType: attachment.mediaType,
    };
  }

  async close() {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const subscription of this.subscriptions) subscription.remove();
    this.subscriptions.clear();
    try {
      await this.transport?.close();
    } finally {
      await this.native.closeRepo(this.localStoreID);
    }
  }

  private assertOpen() {
    if (this.isClosed) throw new Error("Native Automerge store is closed");
  }
}

function nativeSnapshot(
  materialized: NativeMaterializedDocument,
): DocumentSnapshot {
  let data: unknown;
  try {
    data = JSON.parse(materialized.json);
  } catch {
    throw new Error("Native Automerge bridge returned invalid JSON");
  }
  return {
    data,
    heads: materialized.heads,
    conflicts: materialized.conflicts,
    conflictCount: materialized.conflictCount,
  };
}
