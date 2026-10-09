import { requireNativeModule, type EventSubscription } from "expo-modules-core";

export interface NativeMaterializedDocument {
  heads: string[];
  json: string;
  conflictCount: number;
  conflicts: {
    path: string[];
    variantCount: number;
  }[];
}

export interface NativeReadAttachmentResult {
  bytes: Uint8Array;
  sha256Hex: string;
  documentURL: string;
}

export interface NativeRepoDocumentChangedEvent {
  localStoreID: string;
  documentURL: string;
}

export interface NativeRepoSyncStateChangedEvent {
  localStoreID: string;
  state: "connected" | "ready" | "reconnecting" | "disconnected";
}

export interface OrbitAutomergeNativeModule {
  openRepo(localStoreID: string): Promise<void>;
  closeRepo(localStoreID: string): Promise<void>;
  repoDocumentsExist(
    localStoreID: string,
    documentURLs: string[],
  ): Promise<boolean[]>;
  createRepoDocument(
    localStoreID: string,
    json: string,
    documentURL: string | null,
  ): Promise<NativeMaterializedDocument & { documentURL: string }>;
  readRepoAttachment(
    localStoreID: string,
    documentURL: string,
  ): Promise<NativeReadAttachmentResult>;
  materializeRepoDocument(
    localStoreID: string,
    documentURL: string,
  ): Promise<NativeMaterializedDocument>;
  materializeRepoDocuments(
    localStoreID: string,
    documentURLs: string[],
  ): Promise<NativeMaterializedDocument[]>;
  repoDocumentHasHeads(
    localStoreID: string,
    documentURL: string,
    heads: readonly string[],
  ): Promise<boolean>;
  applyRepoPatch(
    localStoreID: string,
    documentURL: string,
    patchJSON: string,
  ): Promise<void>;
  ensureRepoDocument(
    localStoreID: string,
    documentURL: string,
  ): Promise<boolean>;
  connectRepo(
    localStoreID: string,
    websocketURL: string,
    firebaseIDToken: string,
  ): Promise<void>;
  disconnectRepo(localStoreID: string): Promise<void>;
  addListener(
    eventName: "onRepoDocumentChanged",
    listener: (event: NativeRepoDocumentChangedEvent) => void,
  ): EventSubscription;
  addListener(
    eventName: "onRepoSyncStateChanged",
    listener: (event: NativeRepoSyncStateChangedEvent) => void,
  ): EventSubscription;
  replaceWidgetProjection(
    vaultID: string,
    reviewItemsJSON: string,
    revision: string,
  ): Promise<void>;
  pendingWidgetReviewsJSON(vaultID: string): Promise<string>;
  markWidgetReviewsImported(
    vaultID: string,
    observationIDs: string[],
    reviewItemsJSON: string,
    revision: string,
  ): Promise<void>;
}

let cachedModule: OrbitAutomergeNativeModule | undefined;

/** Lazy so platform-independent tests never attempt native module discovery. */
export function getOrbitAutomergeNative(): OrbitAutomergeNativeModule {
  cachedModule ??=
    requireNativeModule<OrbitAutomergeNativeModule>("OrbitAutomerge");
  return cachedModule;
}
