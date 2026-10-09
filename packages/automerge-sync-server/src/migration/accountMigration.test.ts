import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import {
  AttachmentMIMEType,
  EventType,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  eventReducer,
  type AttachmentID,
  type Event,
  type Task,
  type TaskID,
} from "@withorbit/core";
import { afterEach, describe, expect, test } from "bun:test";
import {
  auditAccountMigration,
  buildAuditedAccountMigration,
  exportMigratedReviews,
} from "./accountMigration.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("one-account migration", () => {
  test("builds, reopens, audits, and exports a legacy vault", async () => {
    const root = await temporaryDirectory();
    const events = legacyHistory();
    const task = reduceLegacyHistory(events);
    const attachmentID = "migration-attachment" as AttachmentID;
    task.spec.content.body.attachments.push(attachmentID);
    const manifest = await buildAuditedAccountMigration({
      repoDirectory: path.join(root, "repo"),
      hostedVaultID: "hosted-migration-test",
      accountFingerprint: "account-fingerprint",
      jobID: "job-test",
      createdAtTimestampMillis: 3_000,
      snapshot: {
        registrationTimestampMillis: 500,
        sourceWatermarkOrderedID: "0002",
        tasks: [task],
        eventRecords: events.map((event, index) => ({
          orderedID: String(index + 1).padStart(4, "0"),
          event,
        })),
        attachments: [
          {
            attachmentID,
            bytes: png(),
            mediaType: AttachmentMIMEType.PNG,
          },
        ],
      },
    });

    expect(manifest.source).toMatchObject({
      eventCount: 2,
      taskCount: 1,
      attachmentCount: 1,
      watermarkOrderedID: "0002",
    });
    expect(manifest.source.importedReviewObservationIDs).toHaveLength(1);
    expect(manifest.vault).toMatchObject({
      taskCount: 1,
      activeTaskCount: 1,
      observationCount: 1,
      reviewCount: 1,
      attachmentCount: 1,
    });
    expect(manifest.vault.documents).toHaveLength(4);
    // The audit fingerprint is operational data, not the repository's former
    // synthetic projection heads. Attachment document heads were never included.
    const auditHeads = manifest.vault.documents
      .filter(({ kind }) => kind !== "attachment")
      .flatMap(({ documentURL, heads }) =>
        heads.map((head) => `${documentURL}#${head}`),
      )
      .sort();
    expect(manifest.vault.logicalHeadsSHA256).toBe(
      createHash("sha256").update(JSON.stringify(auditHeads)).digest("hex"),
    );

    await auditAccountMigration({
      repoDirectory: path.join(root, "repo"),
      manifest,
    });
    const exported = await exportMigratedReviews({
      repoDirectory: path.join(root, "repo"),
      rootURL: manifest.vault.rootURL,
      exportedAtTimestampMillis: 4_000,
    });
    expect(exported.reviews).toEqual([
      {
        observationID: expect.any(String),
        taskID,
        componentID: "main",
        reviewSessionID: "session-test",
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: 2_000,
      },
    ]);

    await expect(
      auditAccountMigration({
        repoDirectory: path.join(root, "repo"),
        manifest: {
          ...manifest,
          vault: { ...manifest.vault, reviewCount: 2 },
        },
      }),
    ).rejects.toThrow("audit diverged");
  });

  test("refuses an event snapshot whose watermark is not exact", async () => {
    const root = await temporaryDirectory();
    const events = legacyHistory();
    await expect(
      buildAuditedAccountMigration({
        repoDirectory: path.join(root, "repo"),
        hostedVaultID: "hosted-migration-test",
        accountFingerprint: "account-fingerprint",
        jobID: "job-test",
        createdAtTimestampMillis: 3_000,
        snapshot: {
          registrationTimestampMillis: 500,
          sourceWatermarkOrderedID: "not-the-last-record",
          tasks: [reduceLegacyHistory(events)],
          eventRecords: events.map((event, index) => ({
            orderedID: String(index + 1).padStart(4, "0"),
            event,
          })),
          attachments: [],
        },
      }),
    ).rejects.toThrow("watermark");
  });
});

const taskID = "migration-task" as TaskID;

function legacyHistory(): Event[] {
  return [
    {
      type: EventType.TaskIngest,
      id: "migration-ingest" as never,
      entityID: taskID,
      timestampMillis: 1_000,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.Plain,
          body: { text: "Migration prompt", attachments: [] },
        },
      },
      provenance: null,
      metadata: { source: "test" },
    },
    {
      type: EventType.TaskRepetition,
      id: "migration-review" as never,
      entityID: taskID,
      timestampMillis: 2_000,
      componentID: "main",
      reviewSessionID: "session-test",
      outcome: TaskRepetitionOutcome.Remembered,
    },
  ];
}

function reduceLegacyHistory(events: readonly Event[]): Task {
  let task: Task | null = null;
  for (const event of events) task = eventReducer(task, event) as Task;
  return task!;
}

function png() {
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-account-migration-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}
