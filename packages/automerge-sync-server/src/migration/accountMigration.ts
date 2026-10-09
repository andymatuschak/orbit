import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import * as Automerge from "@automerge/automerge";
import { Repo, type PeerId } from "@automerge/automerge-repo";
import {
  type AttachmentID,
  type AutomergeDocumentURL,
  type Event,
  EventType,
  type ObservationID,
  type SchedulingObservation,
  type Task,
  type VaultID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  RepoAutomergeBinaryStorage,
  createPerTaskVaultFromLegacy,
  legacyObservationID,
  type AutomergeBinaryStorage,
  type LegacyAttachmentInput,
  type LegacyVaultImportStatistics,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { ensureStorageID } from "../storage/accountStorage.js";
import { AtomicNodeFSStorageAdapter } from "../storage/atomicNodeFSStorageAdapter.js";

export const accountMigrationManifestSchemaVersion = 2;
export const accountMigrationConverterVersion = "orbit-automerge-backfill-v2";

export interface LegacyEventRecord {
  orderedID: string;
  event: Event;
}

export interface LegacyAccountSnapshot {
  registrationTimestampMillis: number;
  sourceWatermarkOrderedID: string | null;
  tasks: readonly Task[];
  eventRecords: readonly LegacyEventRecord[];
  attachments: readonly LegacyAttachmentInput[];
}

export interface MigratedDocumentDescriptor {
  kind: "root" | "catalog" | "task" | "attachment";
  documentURL: AutomergeDocumentURL;
  byteLength: number;
  heads: string[];
}

export interface AccountMigrationManifest {
  schemaVersion: typeof accountMigrationManifestSchemaVersion;
  converterVersion: typeof accountMigrationConverterVersion;
  jobID: string;
  accountFingerprint: string;
  hostedVaultID: string;
  createdAtTimestampMillis: number;
  source: {
    watermarkOrderedID: string | null;
    eventCount: number;
    taskCount: number;
    attachmentCount: number;
    importedReviewObservationIDs: ObservationID[];
    eventsSHA256: string;
    tasksSHA256: string;
    attachmentsSHA256: string;
  };
  vault: {
    vaultID: VaultID;
    rootURL: AutomergeDocumentURL;
    taskCount: number;
    activeTaskCount: number;
    observationCount: number;
    reviewCount: number;
    attachmentCount: number;
    projectionSHA256: string;
    logicalVaultSHA256: string;
    logicalHeadsSHA256: string;
    documents: MigratedDocumentDescriptor[];
    attachments: Array<{
      attachmentID: AttachmentID;
      documentURL: AutomergeDocumentURL;
      hash: string;
      byteLength: number;
      mediaType: string;
    }>;
  };
  importStatistics: LegacyVaultImportStatistics;
}

export interface MigratedReviewExport {
  schemaVersion: 2;
  exportedAtTimestampMillis: number;
  vaultID: VaultID;
  rootURL: AutomergeDocumentURL;
  reviews: Array<{
    observationID: ObservationID;
    taskID: string;
    componentID: string;
    reviewSessionID: string | null;
    outcome: string;
    occurredAtTimestampMillis: number;
  }>;
}

export async function buildAuditedAccountMigration(input: {
  repoDirectory: string;
  hostedVaultID: string;
  accountFingerprint: string;
  jobID: string;
  createdAtTimestampMillis: number;
  snapshot: LegacyAccountSnapshot;
}): Promise<AccountMigrationManifest> {
  assertSnapshot(input.snapshot);
  await createEmptyPrivateDirectory(input.repoDirectory);

  const opened = await openMigrationRepo(input.repoDirectory);
  let manifest: AccountMigrationManifest;
  try {
    const eventSequenceNumbers = new Map(
      input.snapshot.eventRecords.map(({ event }, index) => [event.id, index]),
    );
    const { vault, statistics: importStatistics } =
      await createPerTaskVaultFromLegacy({
        storage: opened.binaryStorage,
        vaultID: input.hostedVaultID as VaultID,
        createdAtTimestampMillis: input.snapshot.registrationTimestampMillis,
        legacy: {
          tasks: input.snapshot.tasks,
          events: input.snapshot.eventRecords.map(({ event }) => event),
          eventSequenceNumbers,
          attachments: input.snapshot.attachments,
        },
      });
    manifest = await describeMigration({
      vault,
      storage: opened.binaryStorage,
      hostedVaultID: input.hostedVaultID,
      accountFingerprint: input.accountFingerprint,
      jobID: input.jobID,
      createdAtTimestampMillis: input.createdAtTimestampMillis,
      snapshot: input.snapshot,
      importStatistics,
    });
  } finally {
    await closeMigrationRepo(opened);
  }

  await auditAccountMigration({
    repoDirectory: input.repoDirectory,
    manifest,
  });
  return manifest;
}

export async function auditAccountMigration(input: {
  repoDirectory: string;
  manifest: AccountMigrationManifest;
}): Promise<void> {
  const opened = await openMigrationRepo(input.repoDirectory);
  try {
    const vault = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(opened.binaryStorage),
      input.manifest.vault.rootURL,
    );
    const actual = await describeVault(opened.binaryStorage, vault);
    const expected = comparableVaultManifest(input.manifest.vault);
    if (stableStringify(actual) !== stableStringify(expected)) {
      throw new Error("Fresh-process Automerge migration audit diverged");
    }
  } finally {
    await closeMigrationRepo(opened);
  }
}

export async function exportMigratedReviews(input: {
  repoDirectory: string;
  rootURL: AutomergeDocumentURL;
  exportedAtTimestampMillis?: number;
}): Promise<MigratedReviewExport> {
  const opened = await openMigrationRepo(input.repoDirectory);
  try {
    const vault = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(opened.binaryStorage),
      input.rootURL,
    );
    const logical = await vault.readLogicalVault();
    const reviews = Object.entries(logical.observations)
      .filter(
        (
          entry,
        ): entry is [
          ObservationID,
          Extract<SchedulingObservation, { kind: "review" }>,
        ] => entry[1].kind === "review",
      )
      .sort(
        ([leftID, left], [rightID, right]) =>
          left.occurredAtTimestampMillis - right.occurredAtTimestampMillis ||
          leftID.localeCompare(rightID),
      )
      .map(([observationID, review]) => ({
        observationID,
        taskID: review.taskID,
        componentID: review.componentID,
        reviewSessionID: review.reviewSessionID,
        outcome: review.outcome,
        occurredAtTimestampMillis: review.occurredAtTimestampMillis,
      }));
    return {
      schemaVersion: 2,
      exportedAtTimestampMillis: input.exportedAtTimestampMillis ?? Date.now(),
      vaultID: logical.vaultID,
      rootURL: input.rootURL,
      reviews,
    };
  } finally {
    await closeMigrationRepo(opened);
  }
}

export function migrationManifestSHA256(manifest: AccountMigrationManifest) {
  return sha256String(stableStringify(manifest));
}

async function describeMigration(input: {
  vault: PerTaskRepository;
  storage: AutomergeBinaryStorage;
  hostedVaultID: string;
  accountFingerprint: string;
  jobID: string;
  createdAtTimestampMillis: number;
  snapshot: LegacyAccountSnapshot;
  importStatistics: LegacyVaultImportStatistics;
}): Promise<AccountMigrationManifest> {
  const vault = await describeVault(input.storage, input.vault);
  return {
    schemaVersion: accountMigrationManifestSchemaVersion,
    converterVersion: accountMigrationConverterVersion,
    jobID: input.jobID,
    accountFingerprint: input.accountFingerprint,
    hostedVaultID: input.hostedVaultID,
    createdAtTimestampMillis: input.createdAtTimestampMillis,
    source: {
      watermarkOrderedID: input.snapshot.sourceWatermarkOrderedID,
      eventCount: input.snapshot.eventRecords.length,
      taskCount: input.snapshot.tasks.length,
      attachmentCount: input.snapshot.attachments.length,
      importedReviewObservationIDs: input.snapshot.eventRecords.flatMap(
        ({ event }, index) =>
          event.type === EventType.TaskRepetition
            ? [legacyObservationID(event.id, index)]
            : [],
      ),
      eventsSHA256: sha256Canonical(
        input.snapshot.eventRecords.map(({ orderedID, event }) => [
          orderedID,
          event,
        ]),
      ),
      tasksSHA256: sha256Canonical(
        [...input.snapshot.tasks]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((task) => [task.id, task]),
      ),
      attachmentsSHA256: sha256Canonical(
        [...input.snapshot.attachments]
          .sort((left, right) =>
            left.attachmentID.localeCompare(right.attachmentID),
          )
          .map(({ attachmentID, bytes, mediaType }) => ({
            attachmentID,
            byteLength: bytes.byteLength,
            bytesSHA256: sha256Bytes(bytes),
            mediaType,
          })),
      ),
    },
    vault,
    importStatistics: input.importStatistics,
  };
}

async function describeVault(
  storage: AutomergeBinaryStorage,
  vault: PerTaskRepository,
) {
  const logical = await vault.readLogicalVault();
  const projection = await vault.getProjection();
  const taskURLs = Object.values(await vault.getCatalogEntries())
    .map(({ documentURL }) => documentURL)
    .sort();
  const attachmentURLs = [
    ...new Set(
      Object.values(logical.attachments).map(({ documentURL }) => documentURL),
    ),
  ].sort();
  const documents: MigratedDocumentDescriptor[] = [];
  documents.push(await describeDocument(storage, vault.rootURL, "root"));
  documents.push(await describeDocument(storage, vault.catalogURL, "catalog"));
  for (const url of taskURLs) {
    documents.push(await describeDocument(storage, url, "task"));
  }
  for (const url of attachmentURLs) {
    documents.push(await describeDocument(storage, url, "attachment"));
  }
  const reviews = Object.values(logical.observations).filter(
    ({ kind }) => kind === "review",
  );
  const comparable = {
    vaultID: logical.vaultID,
    rootURL: vault.rootURL,
    taskCount: Object.keys(logical.tasks).length,
    activeTaskCount: [...projection.tasks.values()].filter(
      ({ isDeleted }) => !isDeleted,
    ).length,
    observationCount: Object.keys(logical.observations).length,
    reviewCount: reviews.length,
    attachmentCount: Object.keys(logical.attachments).length,
    projectionSHA256: sha256Canonical(
      [...projection.tasks.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    // Keep existing audit hash preimages stable, without retaining a reader for
    // the retired persisted vault format or a cross-document heads vector.
    logicalVaultSHA256: sha256Canonical({
      ...logical,
      documentType: "com.withorbit.vault",
      schemaVersion: 1,
    }),
    logicalHeadsSHA256: sha256Canonical(
      documents
        .filter(({ kind }) => kind !== "attachment")
        .flatMap(({ documentURL, heads }) =>
          heads.map((head) => `${documentURL}#${head}`),
        )
        .sort(),
    ),
    documents,
    attachments: Object.entries(logical.attachments)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([attachmentID, attachment]) => ({
        attachmentID: attachmentID as AttachmentID,
        documentURL: attachment.documentURL,
        hash: attachment.hash,
        byteLength: attachment.byteLength,
        mediaType: attachment.mediaType,
      })),
  };
  return comparable;
}

function comparableVaultManifest(vault: AccountMigrationManifest["vault"]) {
  return {
    vaultID: vault.vaultID,
    rootURL: vault.rootURL,
    taskCount: vault.taskCount,
    activeTaskCount: vault.activeTaskCount,
    observationCount: vault.observationCount,
    reviewCount: vault.reviewCount,
    attachmentCount: vault.attachmentCount,
    projectionSHA256: vault.projectionSHA256,
    logicalVaultSHA256: vault.logicalVaultSHA256,
    logicalHeadsSHA256: vault.logicalHeadsSHA256,
    documents: vault.documents,
    attachments: vault.attachments,
  };
}

async function describeDocument(
  storage: AutomergeBinaryStorage,
  documentURL: AutomergeDocumentURL,
  kind: MigratedDocumentDescriptor["kind"],
): Promise<MigratedDocumentDescriptor> {
  const bytes = await requiredDocument(storage, documentURL);
  const document = Automerge.load(bytes);
  try {
    return {
      kind,
      documentURL,
      byteLength: bytes.byteLength,
      heads: [...Automerge.getHeads(document)].sort(),
    };
  } finally {
    Automerge.free(document);
  }
}

async function requiredDocument(
  storage: AutomergeBinaryStorage,
  documentURL: AutomergeDocumentURL,
) {
  const bytes = await storage.load(documentURL);
  if (!bytes) throw new Error("Migrated Automerge document is absent");
  return bytes;
}

async function createEmptyPrivateDirectory(directory: string) {
  try {
    await fs.mkdir(directory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      return;
    }
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Migration generation directory already exists");
    }
    throw error;
  }
}

async function openMigrationRepo(repoDirectory: string) {
  const storage = new AtomicNodeFSStorageAdapter(repoDirectory);
  await ensureStorageID(storage);
  const repo = new Repo({
    peerId: `orbit-migration-${randomUUID()}` as PeerId,
    isEphemeral: false,
    storage,
    saveDebounceRate: 0,
    flushConcurrency: 16,
    syncStateLoadConcurrency: 16,
  });
  return {
    storage,
    repo,
    binaryStorage: new RepoAutomergeBinaryStorage(repo),
  };
}

async function closeMigrationRepo(
  opened: Awaited<ReturnType<typeof openMigrationRepo>>,
) {
  await opened.binaryStorage.close();
  await opened.repo.flush();
  await opened.repo.shutdown();
  await opened.storage.close();
}

function assertSnapshot(snapshot: LegacyAccountSnapshot) {
  if (
    !Number.isSafeInteger(snapshot.registrationTimestampMillis) ||
    snapshot.registrationTimestampMillis < 0
  ) {
    throw new Error("Invalid legacy registration timestamp");
  }
  let previous: string | null = null;
  const eventIDs = new Set<string>();
  for (const { orderedID, event } of snapshot.eventRecords) {
    if (!orderedID || (previous !== null && orderedID <= previous)) {
      throw new Error("Legacy event boundary is not strictly ordered");
    }
    if (eventIDs.has(event.id)) {
      throw new Error("Legacy event IDs are not unique");
    }
    eventIDs.add(event.id);
    previous = orderedID;
  }
  if (snapshot.sourceWatermarkOrderedID !== previous) {
    throw new Error("Legacy event watermark does not match the snapshot");
  }
  if (
    new Set(snapshot.tasks.map(({ id }) => id)).size !== snapshot.tasks.length
  ) {
    throw new Error("Legacy task IDs are not unique");
  }
  if (
    new Set(snapshot.attachments.map(({ attachmentID }) => attachmentID))
      .size !== snapshot.attachments.length
  ) {
    throw new Error("Legacy attachment IDs are not unique");
  }
}

function sha256Canonical(value: unknown) {
  return sha256String(stableStringify(value));
}

function sha256Bytes(value: Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function sha256String(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortForJSON(value));
}

function sortForJSON(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJSON);
  if (value instanceof Uint8Array) {
    return { byteLength: value.byteLength, sha256: sha256Bytes(value) };
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForJSON(entry)]),
    );
  }
  return value;
}
