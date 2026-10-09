import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HostedVaultAccountRecord } from "@withorbit/api";
import type { AttachmentID, ObservationID } from "@withorbit/core";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { accountStorageDirectory } from "./storage/accountStorage.js";
import {
  auditAccountMigration,
  buildAuditedAccountMigration,
  exportMigratedReviews,
  migrationManifestSHA256,
  type AccountMigrationManifest,
  type MigratedReviewExport,
} from "./migration/accountMigration.js";
import {
  AccountMigrationError,
  beginLegacyAccountMigration,
  completeLegacyAccountMigration,
  readStableLegacyAccountSnapshot,
  recordLegacyMigrationWatermark,
  requireCompletedMigrationAccount,
  requireLegacyMigrationAccount,
  requireResumableMigrationAccount,
  rollbackIncompleteLegacyMigration,
} from "./migration/firestoreLegacyAccount.js";

const rollbackWindowMillis = 90 * 24 * 60 * 60 * 1_000;
const maximumManifestBytes = 16 * 1_024 * 1_024;

type MigrationCommand = "dry-run" | "apply" | "export-reviews";

interface CommandOptions {
  command: MigrationCommand;
  subject?: string;
  email?: string;
  projectID?: string;
  bucket?: string;
  storageRoot: string;
  output?: string;
  jobID: string;
  confirmServerStopped: boolean;
}

interface ManifestEnvelope {
  schemaVersion: 1;
  manifestSHA256: string;
  manifest: AccountMigrationManifest;
}

export async function runAccountMigrationCommand(
  arguments_: readonly string[] = process.argv.slice(2),
) {
  const options = parseArguments(arguments_);
  const app = firebaseApp(options);
  const projectID =
    app.options.projectId ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    process.env.GCLOUD_PROJECT;
  if (!projectID) throw new AccountMigrationError("project-id-unavailable");
  const subject = await resolveSubject(app, options);
  const firestore = getFirestore(app);
  const storageRoot = path.resolve(options.storageRoot);
  const accountFingerprint = sha256(
    `orbit-account:${projectID}\0${subject}`,
  ).slice(0, 24);

  if (options.command === "export-reviews") {
    if (!options.confirmServerStopped) {
      throw new AccountMigrationError("server-stop-confirmation-required");
    }
    if (!options.output) {
      throw new AccountMigrationError("review-export-output-required");
    }
    const account = await requireCompletedMigrationAccount(firestore, subject);
    const manifest = await readManifest(
      resolveArchivedManifestPath(
        storageRoot,
        account.migration.legacyArchiveKey,
      ),
      {
        accountFingerprint,
        account,
      },
    );
    const allReviews = await exportMigratedReviews({
      repoDirectory: accountStorageDirectory(
        storageRoot,
        account.hostedVaultID,
      ),
      rootURL: account.root.documentURL,
    });
    const reviews = selectPostMigrationReviews(
      allReviews.reviews,
      manifest.source.importedReviewObservationIDs,
    );
    await writePrivateJSONExclusive(path.resolve(options.output), {
      schemaVersion: 2,
      exportedAtTimestampMillis: allReviews.exportedAtTimestampMillis,
      vaultID: allReviews.vaultID,
      rootURL: allReviews.rootURL,
      cutoverAtTimestampMillis: account.migration.cutoverAtTimestampMillis,
      migrationManifestSHA256: migrationManifestSHA256(manifest),
      importedReviewCount: manifest.source.importedReviewObservationIDs.length,
      reviews,
    });
    safeLog({
      event: "automerge_review_export_complete",
      accountFingerprint,
      reviewCount: reviews.length,
    });
    return;
  }

  const downloadAttachment = legacyAttachmentDownloader({
    app,
    projectID,
    bucket: options.bucket,
    subject,
  });
  if (options.command === "dry-run") {
    const account = await requireLegacyMigrationAccount(firestore, subject);
    const paths = migrationPaths(
      storageRoot,
      account.hostedVaultID,
      options.jobID,
    );
    if (await exists(paths.stagingGenerationDirectory)) {
      throw new AccountMigrationError("dry-run-generation-already-exists");
    }
    try {
      const snapshot = await readStableLegacyAccountSnapshot({
        firestore,
        subject,
        registrationTimestampMillis: account.registrationTimestampMillis,
        downloadAttachment,
      });
      const manifest = await buildAuditedAccountMigration({
        repoDirectory: paths.stagingRepoDirectory,
        hostedVaultID: account.hostedVaultID,
        accountFingerprint,
        jobID: options.jobID,
        createdAtTimestampMillis: Date.now(),
        snapshot,
      });
      safeLog(
        migrationSummary("automerge_account_migration_dry_run", manifest),
      );
    } finally {
      await removeExactGeneration(paths.stagingGenerationDirectory);
    }
    return;
  }

  if (!options.confirmServerStopped) {
    throw new AccountMigrationError("server-stop-confirmation-required");
  }
  const account = await requireResumableMigrationAccount(
    firestore,
    subject,
    options.jobID,
  );
  await applyMigration({
    firestore,
    subject,
    account,
    accountFingerprint,
    jobID: options.jobID,
    storageRoot,
    downloadAttachment,
  });
}

/** The migration manifest identifies the exact imported historical reviews. */
export function selectPostMigrationReviews(
  reviews: readonly MigratedReviewExport["reviews"][number][],
  importedReviewObservationIDs: readonly ObservationID[],
) {
  const importedReviewIDs = new Set(importedReviewObservationIDs);
  return reviews.filter(
    ({ observationID }) => !importedReviewIDs.has(observationID),
  );
}

async function applyMigration(input: {
  firestore: ReturnType<typeof getFirestore>;
  subject: string;
  account: HostedVaultAccountRecord;
  accountFingerprint: string;
  jobID: string;
  storageRoot: string;
  downloadAttachment: (attachmentID: AttachmentID) => Promise<Uint8Array>;
}) {
  const paths = migrationPaths(
    input.storageRoot,
    input.account.hostedVaultID,
    input.jobID,
  );
  const finalExistsBeforeFreeze = await exists(paths.finalRepoDirectory);
  const manifestExistsBeforeFreeze = await exists(paths.manifestPath);
  const stagingExistsBeforeFreeze = await exists(paths.stagingRepoDirectory);
  if (
    (finalExistsBeforeFreeze && !manifestExistsBeforeFreeze) ||
    (manifestExistsBeforeFreeze &&
      !finalExistsBeforeFreeze &&
      !stagingExistsBeforeFreeze)
  ) {
    throw new AccountMigrationError("incomplete-generation-needs-audit");
  }
  if (
    manifestExistsBeforeFreeze &&
    input.account.migration.mode !== "migrating"
  ) {
    throw new AccountMigrationError("orphaned-migration-generation");
  }

  safeLog({
    event: "automerge_account_migration_starting",
    accountFingerprint: input.accountFingerprint,
    jobID: input.jobID,
  });
  await beginLegacyAccountMigration({
    firestore: input.firestore,
    subject: input.subject,
    expectedIssuer: input.account.authIssuer,
    expectedHostedVaultID: input.account.hostedVaultID,
    jobID: input.jobID,
    startedAtTimestampMillis: Date.now(),
  });

  try {
    let manifest: AccountMigrationManifest;
    if (finalExistsBeforeFreeze) {
      manifest = await readManifest(paths.manifestPath, input);
      await auditAccountMigration({
        repoDirectory: paths.finalRepoDirectory,
        manifest,
      });
    } else if (await exists(paths.manifestPath)) {
      if (!(await exists(paths.stagingRepoDirectory))) {
        throw new AccountMigrationError("migration-generation-missing");
      }
      manifest = await readManifest(paths.manifestPath, input);
      await auditAccountMigration({
        repoDirectory: paths.stagingRepoDirectory,
        manifest,
      });
      await installGeneration(paths);
    } else {
      await removeExactGeneration(paths.stagingGenerationDirectory);
      const snapshot = await readStableLegacyAccountSnapshot({
        firestore: input.firestore,
        subject: input.subject,
        registrationTimestampMillis: input.account.registrationTimestampMillis,
        downloadAttachment: input.downloadAttachment,
      });
      await recordLegacyMigrationWatermark({
        firestore: input.firestore,
        subject: input.subject,
        expectedHostedVaultID: input.account.hostedVaultID,
        jobID: input.jobID,
        sourceWatermarkOrderedID: snapshot.sourceWatermarkOrderedID,
      });
      manifest = await buildAuditedAccountMigration({
        repoDirectory: paths.stagingRepoDirectory,
        hostedVaultID: input.account.hostedVaultID,
        accountFingerprint: input.accountFingerprint,
        jobID: input.jobID,
        createdAtTimestampMillis: Date.now(),
        snapshot,
      });
      await writeManifest(paths.manifestPath, manifest);
      await installGeneration(paths);
    }

    await recordLegacyMigrationWatermark({
      firestore: input.firestore,
      subject: input.subject,
      expectedHostedVaultID: input.account.hostedVaultID,
      jobID: input.jobID,
      sourceWatermarkOrderedID: manifest.source.watermarkOrderedID,
    });
    await auditAccountMigration({
      repoDirectory: paths.finalRepoDirectory,
      manifest,
    });
    const completedAtTimestampMillis = Date.now();
    await removeExactGeneration(paths.stagingGenerationDirectory);
    await completeLegacyAccountMigration({
      firestore: input.firestore,
      subject: input.subject,
      expectedHostedVaultID: input.account.hostedVaultID,
      jobID: input.jobID,
      sourceWatermarkOrderedID: manifest.source.watermarkOrderedID,
      rootURL: manifest.vault.rootURL,
      completedAtTimestampMillis,
      rollbackUntilTimestampMillis:
        completedAtTimestampMillis + rollbackWindowMillis,
      legacyArchiveKey: path
        .relative(input.storageRoot, paths.manifestPath)
        .split(path.sep)
        .join("/"),
    });
    safeLog(migrationSummary("automerge_account_migration_complete", manifest));
  } catch (error) {
    if (!(await exists(paths.finalRepoDirectory))) {
      await removeExactGeneration(paths.stagingGenerationDirectory);
      await removeExactFile(paths.manifestPath);
      await rollbackIncompleteLegacyMigration({
        firestore: input.firestore,
        subject: input.subject,
        expectedHostedVaultID: input.account.hostedVaultID,
        jobID: input.jobID,
      });
    }
    throw error;
  }
}

function migrationPaths(
  storageRoot: string,
  hostedVaultID: string,
  jobID: string,
) {
  assertJobID(jobID);
  const opaqueAccountDirectory = sha256(
    `orbit-account-migration:${hostedVaultID}`,
  );
  const stagingGenerationDirectory = path.join(
    storageRoot,
    "v1",
    "migration-staging",
    opaqueAccountDirectory,
    jobID,
  );
  return {
    stagingGenerationDirectory,
    stagingRepoDirectory: path.join(stagingGenerationDirectory, "repo"),
    finalRepoDirectory: accountStorageDirectory(storageRoot, hostedVaultID),
    manifestPath: path.join(
      storageRoot,
      "v1",
      "migration-manifests",
      opaqueAccountDirectory,
      `${jobID}.json`,
    ),
  };
}

async function installGeneration(paths: ReturnType<typeof migrationPaths>) {
  if (await exists(paths.finalRepoDirectory)) {
    throw new AccountMigrationError("account-storage-already-exists");
  }
  await fs.mkdir(path.dirname(paths.finalRepoDirectory), {
    recursive: true,
    mode: 0o700,
  });
  await fs.rename(paths.stagingRepoDirectory, paths.finalRepoDirectory);
  await syncDirectory(path.dirname(paths.finalRepoDirectory));
}

async function writeManifest(
  manifestPath: string,
  manifest: AccountMigrationManifest,
) {
  const envelope: ManifestEnvelope = {
    schemaVersion: 1,
    manifestSHA256: migrationManifestSHA256(manifest),
    manifest,
  };
  await writePrivateJSONExclusive(manifestPath, envelope);
}

async function readManifest(
  manifestPath: string,
  expected: {
    accountFingerprint: string;
    account: Pick<HostedVaultAccountRecord, "hostedVaultID">;
    jobID?: string;
  },
) {
  const stat = await fs.stat(manifestPath);
  if (stat.size > maximumManifestBytes) {
    throw new AccountMigrationError("migration-manifest-too-large");
  }
  const parsed: unknown = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (
    !isRecord(parsed) ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.manifestSHA256 !== "string" ||
    !isRecord(parsed.manifest)
  ) {
    throw new AccountMigrationError("invalid-migration-manifest");
  }
  const manifest = parsed.manifest as unknown as AccountMigrationManifest;
  if (
    parsed.manifestSHA256 !== migrationManifestSHA256(manifest) ||
    manifest.accountFingerprint !== expected.accountFingerprint ||
    manifest.hostedVaultID !== expected.account.hostedVaultID ||
    (expected.jobID !== undefined && manifest.jobID !== expected.jobID)
  ) {
    throw new AccountMigrationError("migration-manifest-mismatch");
  }
  return manifest;
}

function resolveArchivedManifestPath(storageRoot: string, archiveKey: string) {
  if (path.isAbsolute(archiveKey)) {
    throw new AccountMigrationError("invalid-migration-archive-key");
  }
  const allowedRoot = path.resolve(storageRoot, "v1", "migration-manifests");
  const resolved = path.resolve(storageRoot, archiveKey);
  if (!resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new AccountMigrationError("invalid-migration-archive-key");
  }
  return resolved;
}

function legacyAttachmentDownloader(input: {
  app: App;
  projectID: string;
  bucket?: string;
  subject: string;
}) {
  const bucketName =
    input.bucket ??
    process.env.ORBIT_LEGACY_ATTACHMENT_BUCKET ??
    input.app.options.storageBucket ??
    `${input.projectID}.appspot.com`;
  const bucket = getStorage(input.app).bucket(bucketName);
  return async (attachmentID: AttachmentID) => {
    try {
      const [bytes] = await bucket
        .file(`attachments/${input.subject}/${attachmentID}`)
        .download();
      return new Uint8Array(bytes);
    } catch {
      throw new AccountMigrationError("legacy-attachment-download-failed");
    }
  };
}

async function resolveSubject(app: App, options: CommandOptions) {
  if ((options.subject ? 1 : 0) + (options.email ? 1 : 0) !== 1) {
    throw new AccountMigrationError("exactly-one-account-selector-required");
  }
  const auth = getAuth(app);
  try {
    const record = options.email
      ? await auth.getUserByEmail(options.email)
      : await auth.getUser(options.subject!);
    return record.uid;
  } catch {
    throw new AccountMigrationError("firebase-account-not-found");
  }
}

function firebaseApp(options: CommandOptions) {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    ...(options.projectID ? { projectId: options.projectID } : {}),
    ...(options.bucket ? { storageBucket: options.bucket } : {}),
  });
}

function parseArguments(arguments_: readonly string[]): CommandOptions {
  const argumentsCopy = [...arguments_];
  const first = argumentsCopy[0];
  const command: MigrationCommand =
    first === "dry-run" || first === "apply" || first === "export-reviews"
      ? (argumentsCopy.shift() as MigrationCommand)
      : "dry-run";
  const values = new Map<string, string>();
  let confirmServerStopped = false;
  while (argumentsCopy.length > 0) {
    const name = argumentsCopy.shift()!;
    if (name === "--confirm-server-stopped") {
      if (confirmServerStopped) throw usageError();
      confirmServerStopped = true;
      continue;
    }
    if (
      ![
        "--subject",
        "--email",
        "--project-id",
        "--bucket",
        "--storage-root",
        "--output",
        "--job-id",
      ].includes(name) ||
      values.has(name)
    ) {
      throw usageError();
    }
    const value = argumentsCopy.shift();
    if (!value || value.startsWith("--")) throw usageError();
    values.set(name, value);
  }
  const storageRoot =
    values.get("--storage-root") ?? process.env.ORBIT_SYNC_STORAGE_ROOT;
  if (!storageRoot) {
    throw new AccountMigrationError("storage-root-required");
  }
  const jobID = values.get("--job-id") ?? randomUUID();
  assertJobID(jobID);
  return {
    command,
    subject: values.get("--subject"),
    email: values.get("--email"),
    projectID: values.get("--project-id"),
    bucket: values.get("--bucket"),
    storageRoot,
    output: values.get("--output"),
    jobID,
    confirmServerStopped,
  };
}

function usageError() {
  return new AccountMigrationError("invalid-command-line");
}

function assertJobID(value: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw new AccountMigrationError("invalid-job-id");
  }
}

function migrationSummary(event: string, manifest: AccountMigrationManifest) {
  return {
    event,
    accountFingerprint: manifest.accountFingerprint,
    jobID: manifest.jobID,
    sourceWatermarkSHA256: sha256(
      manifest.source.watermarkOrderedID ?? "empty",
    ),
    sourceEventsSHA256: manifest.source.eventsSHA256,
    sourceTasksSHA256: manifest.source.tasksSHA256,
    sourceAttachmentsSHA256: manifest.source.attachmentsSHA256,
    eventCount: manifest.source.eventCount,
    taskCount: manifest.vault.taskCount,
    activeTaskCount: manifest.vault.activeTaskCount,
    observationCount: manifest.vault.observationCount,
    reviewCount: manifest.vault.reviewCount,
    attachmentCount: manifest.vault.attachmentCount,
    documentCount: manifest.vault.documents.length,
    logicalVaultSHA256: manifest.vault.logicalVaultSHA256,
    manifestSHA256: migrationManifestSHA256(manifest),
  };
}

async function writePrivateJSONExclusive(filePath: string, value: unknown) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(
    directory,
    `.pending-${process.pid}-${randomUUID()}`,
  );
  const file = await fs.open(temporaryPath, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`);
    await file.sync();
  } catch (error) {
    await file.close();
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  await file.close();
  try {
    await fs.link(temporaryPath, filePath);
    await fs.unlink(temporaryPath);
    await syncDirectory(directory);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new AccountMigrationError("private-output-already-exists");
    }
    throw error;
  }
}

async function syncDirectory(directory: string) {
  try {
    const handle = await fs.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      !["EINVAL", "ENOTSUP", "EBADF"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
  }
}

async function exists(target: string) {
  try {
    await fs.lstat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeExactGeneration(target: string) {
  if (!target.includes(`${path.sep}migration-staging${path.sep}`)) {
    throw new AccountMigrationError("unsafe-staging-cleanup-target");
  }
  await fs.rm(target, { recursive: true, force: true });
}

async function removeExactFile(target: string) {
  if (!target.includes(`${path.sep}migration-manifests${path.sep}`)) {
    throw new AccountMigrationError("unsafe-manifest-cleanup-target");
  }
  await fs.rm(target, { force: true });
}

function safeLog(value: Record<string, unknown>) {
  console.info(JSON.stringify(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runAccountMigrationCommand();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "automerge_account_migration_failed",
        errorCode:
          error instanceof AccountMigrationError
            ? error.code
            : "unexpected-error",
      }),
    );
    process.exitCode = 1;
  }
}
