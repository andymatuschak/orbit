import type { HostedVaultAccountRecord } from "@withorbit/api";
import {
  AttachmentMIMEType,
  EntityType,
  referencedAttachmentIDs,
  type AttachmentID,
  type AttachmentReference,
  type AutomergeDocumentURL,
  type Event,
  type Task,
} from "@withorbit/core";
import type {
  DocumentData,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { FirestoreHostedVaultAccountStore } from "../accounts/firestoreAccountStore.js";
import type { LegacyAccountSnapshot } from "./accountMigration.js";

const pageSize = 500;
const snapshotAttemptLimit = 3;

export class AccountMigrationError extends Error {
  readonly name = "AccountMigrationError";

  constructor(readonly code: string) {
    super(`Account migration failed: ${code}`);
  }
}

export async function requireLegacyMigrationAccount(
  firestore: Firestore,
  subject: string,
) {
  const account = await new FirestoreHostedVaultAccountStore(
    firestore,
  ).getBySubject(subject);
  if (!account) throw new AccountMigrationError("account-not-provisioned");
  if (account.migration.mode !== "legacy") {
    throw new AccountMigrationError("account-not-legacy");
  }
  if (account.root.status !== "unbound") {
    throw new AccountMigrationError("legacy-root-already-bound");
  }
  return account;
}

export async function requireResumableMigrationAccount(
  firestore: Firestore,
  subject: string,
  jobID: string,
) {
  const account = await new FirestoreHostedVaultAccountStore(
    firestore,
  ).getBySubject(subject);
  if (!account) throw new AccountMigrationError("account-not-provisioned");
  if (account.root.status !== "unbound") {
    throw new AccountMigrationError("legacy-root-already-bound");
  }
  if (
    account.migration.mode !== "legacy" &&
    !(
      account.migration.mode === "migrating" &&
      account.migration.jobID === jobID
    )
  ) {
    throw new AccountMigrationError("account-not-resumable");
  }
  return account;
}

export async function requireCompletedMigrationAccount(
  firestore: Firestore,
  subject: string,
) {
  const account = await new FirestoreHostedVaultAccountStore(
    firestore,
  ).getBySubject(subject);
  if (!account) throw new AccountMigrationError("account-not-provisioned");
  if (
    account.migration.mode !== "automerge" ||
    account.migration.source !== "legacy-cutover" ||
    typeof account.migration.legacyArchiveKey !== "string" ||
    account.migration.legacyArchiveKey.length === 0 ||
    account.root.status !== "bound"
  ) {
    throw new AccountMigrationError("account-not-migrated");
  }
  return account as HostedVaultAccountRecord & {
    migration: Extract<
      HostedVaultAccountRecord["migration"],
      { mode: "automerge" }
    > & { source: "legacy-cutover"; legacyArchiveKey: string };
    root: Extract<HostedVaultAccountRecord["root"], { status: "bound" }>;
  };
}

export async function beginLegacyAccountMigration(input: {
  firestore: Firestore;
  subject: string;
  expectedIssuer: string;
  expectedHostedVaultID: string;
  jobID: string;
  startedAtTimestampMillis: number;
}) {
  await input.firestore.runTransaction(async (transaction) => {
    const reference = accountReference(input.firestore, input.subject);
    const snapshot = await transaction.get(reference);
    const record = snapshot.data();
    assertExpectedAccount(record, input);
    if (record.migration.mode === "migrating") {
      if (record.migration.jobID !== input.jobID) {
        throw new AccountMigrationError("different-migration-in-progress");
      }
      return;
    }
    if (record.migration.mode !== "legacy") {
      throw new AccountMigrationError("account-not-legacy");
    }
    if (record.root.status !== "unbound") {
      throw new AccountMigrationError("legacy-root-already-bound");
    }
    transaction.set(
      reference,
      {
        migration: {
          mode: "migrating",
          jobID: input.jobID,
          startedAtTimestampMillis: input.startedAtTimestampMillis,
          sourceWatermarkOrderedID: null,
        },
      },
      { merge: true },
    );
  });
}

export async function recordLegacyMigrationWatermark(input: {
  firestore: Firestore;
  subject: string;
  expectedHostedVaultID: string;
  jobID: string;
  sourceWatermarkOrderedID: string | null;
}) {
  await input.firestore.runTransaction(async (transaction) => {
    const reference = accountReference(input.firestore, input.subject);
    const record = (await transaction.get(reference)).data();
    assertMatchingMigration(record, input);
    transaction.set(
      reference,
      {
        migration: {
          ...record.migration,
          sourceWatermarkOrderedID: input.sourceWatermarkOrderedID,
        },
      },
      { merge: true },
    );
  });
}

export async function completeLegacyAccountMigration(input: {
  firestore: Firestore;
  subject: string;
  expectedHostedVaultID: string;
  jobID: string;
  sourceWatermarkOrderedID: string | null;
  rootURL: AutomergeDocumentURL;
  completedAtTimestampMillis: number;
  rollbackUntilTimestampMillis: number;
  legacyArchiveKey: string;
}) {
  await input.firestore.runTransaction(async (transaction) => {
    const reference = accountReference(input.firestore, input.subject);
    const record = (await transaction.get(reference)).data();
    assertMatchingMigration(record, input);
    if (
      record.migration.sourceWatermarkOrderedID !==
      input.sourceWatermarkOrderedID
    ) {
      throw new AccountMigrationError("migration-watermark-changed");
    }
    if (record.root.status !== "unbound") {
      throw new AccountMigrationError("root-bound-during-migration");
    }
    transaction.set(
      reference,
      {
        root: {
          status: "bound",
          documentURL: input.rootURL,
          boundAtTimestampMillis: input.completedAtTimestampMillis,
        },
        migration: {
          mode: "automerge",
          source: "legacy-cutover",
          cutoverAtTimestampMillis: input.completedAtTimestampMillis,
          rollbackUntilTimestampMillis: input.rollbackUntilTimestampMillis,
          legacyArchiveKey: input.legacyArchiveKey,
        },
        notificationMode: "pending",
      },
      { merge: true },
    );
  });
}

export async function rollbackIncompleteLegacyMigration(input: {
  firestore: Firestore;
  subject: string;
  expectedHostedVaultID: string;
  jobID: string;
}) {
  await input.firestore.runTransaction(async (transaction) => {
    const reference = accountReference(input.firestore, input.subject);
    const record = (await transaction.get(reference)).data();
    assertMatchingMigration(record, input);
    if (record.root.status !== "unbound") {
      throw new AccountMigrationError("cannot-rollback-bound-root");
    }
    transaction.set(
      reference,
      {
        migration: { mode: "legacy" },
        notificationMode: "legacy",
      },
      { merge: true },
    );
  });
}

export async function readStableLegacyAccountSnapshot(input: {
  firestore: Firestore;
  subject: string;
  registrationTimestampMillis: number;
  downloadAttachment: (attachmentID: AttachmentID) => Promise<Uint8Array>;
}): Promise<LegacyAccountSnapshot> {
  for (let attempt = 1; attempt <= snapshotAttemptLimit; attempt++) {
    const initialWatermark = await readEventWatermark(
      input.firestore,
      input.subject,
    );
    const [eventRecords, entities] = await Promise.all([
      readEvents(input.firestore, input.subject),
      readEntities(input.firestore, input.subject),
    ]);
    const tasks = entities.tasks.sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    const attachmentIDs = [
      ...new Set(tasks.flatMap(({ spec }) => referencedAttachmentIDs(spec))),
    ].sort();
    const attachments = [];
    for (const attachmentID of attachmentIDs) {
      const reference = entities.attachments.get(attachmentID);
      if (!reference) {
        throw new AccountMigrationError("missing-attachment-reference");
      }
      attachments.push({
        attachmentID,
        bytes: await input.downloadAttachment(attachmentID),
        mediaType: reference.mimeType,
      });
    }
    const finalWatermark = await readEventWatermark(
      input.firestore,
      input.subject,
    );
    const listedWatermark =
      eventRecords[eventRecords.length - 1]?.orderedID ?? null;
    if (
      initialWatermark === finalWatermark &&
      listedWatermark === finalWatermark
    ) {
      return {
        registrationTimestampMillis: input.registrationTimestampMillis,
        sourceWatermarkOrderedID: finalWatermark,
        tasks,
        eventRecords,
        attachments,
      };
    }
  }
  throw new AccountMigrationError("legacy-source-did-not-quiesce");
}

async function readEventWatermark(firestore: Firestore, subject: string) {
  const snapshot = await firestore
    .collection(`users/${subject}/events`)
    .orderBy("orderedID", "desc")
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return requiredOrderedID(snapshot.docs[0].data());
}

async function readEvents(firestore: Firestore, subject: string) {
  return mapAll(
    firestore.collection(`users/${subject}/events`).orderBy("orderedID"),
    (document) => {
      const data = document.data();
      const orderedID = requiredOrderedID(data);
      if (!isRecord(data.event) || !boundedString(data.event.id, 512)) {
        throw new AccountMigrationError("invalid-legacy-event");
      }
      return { orderedID, event: data.event as unknown as Event };
    },
  );
}

async function readEntities(firestore: Firestore, subject: string) {
  const tasks: Task[] = [];
  const attachments = new Map<AttachmentID, AttachmentReference>();
  await forEachDocument(
    firestore.collection(`users/${subject}/entities`).orderBy("orderedID"),
    (document) => {
      const entity = document.data().entity;
      if (!isRecord(entity) || !boundedString(entity.id, 512)) {
        throw new AccountMigrationError("invalid-legacy-entity");
      }
      if (entity.type === EntityType.Task) {
        tasks.push(entity as unknown as Task);
      } else if (entity.type === EntityType.AttachmentReference) {
        if (
          !Object.values(AttachmentMIMEType).includes(entity.mimeType as never)
        ) {
          throw new AccountMigrationError("invalid-attachment-media-type");
        }
        attachments.set(
          entity.id as AttachmentID,
          entity as unknown as AttachmentReference,
        );
      } else {
        throw new AccountMigrationError("unknown-legacy-entity-type");
      }
    },
  );
  return { tasks, attachments };
}

async function mapAll<T>(
  query: Query<DocumentData>,
  transform: (document: QueryDocumentSnapshot<DocumentData>) => T,
) {
  const output: T[] = [];
  await forEachDocument(query, (document) => {
    output.push(transform(document));
  });
  return output;
}

async function forEachDocument(
  query: Query<DocumentData>,
  visit: (document: QueryDocumentSnapshot<DocumentData>) => void,
) {
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  do {
    const page = await (last ? query.startAfter(last) : query)
      .limit(pageSize)
      .get();
    for (const document of page.docs) visit(document);
    last = page.docs.at(-1);
    if (page.size < pageSize) break;
  } while (last);
}

function accountReference(firestore: Firestore, subject: string) {
  if (!boundedString(subject, 128)) {
    throw new AccountMigrationError("invalid-account-subject");
  }
  return firestore.doc(`hostedVaultAccounts/${encodeURIComponent(subject)}`);
}

function assertExpectedAccount(
  value: DocumentData | undefined,
  expected: {
    subject: string;
    expectedIssuer: string;
    expectedHostedVaultID: string;
  },
): asserts value is DocumentData {
  if (
    !value ||
    value.authSubject !== expected.subject ||
    value.authIssuer !== expected.expectedIssuer ||
    value.hostedVaultID !== expected.expectedHostedVaultID ||
    !isRecord(value.migration) ||
    !isRecord(value.root)
  ) {
    throw new AccountMigrationError("account-identity-changed");
  }
}

function assertMatchingMigration(
  value: DocumentData | undefined,
  expected: {
    expectedHostedVaultID: string;
    jobID: string;
  },
): asserts value is DocumentData & {
  migration: {
    mode: "migrating";
    jobID: string;
    sourceWatermarkOrderedID: string | null;
  };
  root: { status: string };
} {
  if (
    !value ||
    value.hostedVaultID !== expected.expectedHostedVaultID ||
    !isRecord(value.migration) ||
    value.migration.mode !== "migrating" ||
    value.migration.jobID !== expected.jobID ||
    !isRecord(value.root)
  ) {
    throw new AccountMigrationError("migration-state-changed");
  }
}

function requiredOrderedID(value: DocumentData) {
  if (!boundedString(value.orderedID, 512)) {
    throw new AccountMigrationError("invalid-legacy-ordered-id");
  }
  return value.orderedID;
}

function boundedString(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximumLength
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
