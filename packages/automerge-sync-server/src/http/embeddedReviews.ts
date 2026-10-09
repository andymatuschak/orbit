import { createHash } from "node:crypto";
import {
  maximumEmbeddedAttachmentBytes,
  maximumEmbeddedReviewBatchSize,
  type EmbeddedProjectionResponse,
  type EmbeddedReviewBatch,
  type EmbeddedReviewResponse,
  type EmbeddedReviewSubmission,
  type ResolveHostedRootResponse,
} from "@withorbit/api";
import {
  assertSafeAttachmentBytes,
  AttachmentMIMEType,
  componentIDsForTaskSpec,
  referencedAttachmentIDs,
  TaskRepetitionOutcome,
  type AttachmentID,
  type ObservationID,
  type TaskID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import { RepoAutomergeAttachmentWriter } from "@withorbit/store-automerge";
import { decodeTask } from "@withorbit/store-shared/perTaskCodec";
import type { AccountRepoPool } from "../repo/accountRepoPool.js";

/** The HTTP ingress resolves identity and the sticky root; clients supply neither. */
export class EmbeddedReviews {
  constructor(private readonly repos: AccountRepoPool) {}

  async projections(
    root: ResolveHostedRootResponse,
    body: unknown,
  ): Promise<EmbeddedProjectionResponse> {
    const raw = object(body);
    exactKeys(raw, ["taskIDs"]);
    const taskIDs = array(raw.taskIDs).map(taskID);
    return this.repos.withVault(
      root.accountID,
      root.rootDocumentURL,
      async (vault) => ({
        tasks: [...(await vault.getTaskProjections(taskIDs)).tasks.values()],
      }),
    );
  }

  async reviews(
    root: ResolveHostedRootResponse,
    body: unknown,
  ): Promise<EmbeddedReviewResponse> {
    const batch = decodeBatch(body);
    return this.repos.withVault(
      root.accountID,
      root.rootDocumentURL,
      async (vault, repo) => {
        const mutations: VaultMutation[] = [];
        const taskIDs = batch.reviews.map(({ taskID }) => taskID);
        const existing = await vault.getTaskProjections(taskIDs);
        const specs = new Map(
          [...existing.tasks].map(([id, task]) => [id, task.spec]),
        );
        for (const review of batch.reviews) {
          const spec = specs.get(review.taskID) ?? review.taskSeed.spec;
          specs.set(review.taskID, spec);
          if (!componentIDsForTaskSpec(spec).includes(review.componentID))
            throw new TypeError("Unknown existing task component");
        }
        const writer = new RepoAutomergeAttachmentWriter(repo);
        for (const attachment of batch.attachments ?? []) {
          const prepared = await writer.prepare({
            attachmentID: attachment.attachmentID,
            bytes: new Uint8Array(
              Buffer.from(attachment.bytesBase64, "base64"),
            ),
            mediaTypeHint: attachment.mediaTypeHint,
          });
          mutations.push({
            kind: "registerAttachment",
            mutationID:
              `attachment/${attachment.attachmentID}` as VaultMutationID,
            attachmentID: attachment.attachmentID,
            attachment: prepared.catalogEntry,
          });
        }
        for (const review of batch.reviews) {
          const observationID = embeddedReviewObservationID(review);
          mutations.push({
            kind: "recordReview",
            mutationID: observationID as unknown as VaultMutationID,
            observationID,
            taskID: review.taskID,
            taskSeed: review.taskSeed,
            componentID: review.componentID,
            reviewSessionID: review.sessionID,
            outcome: review.outcome,
            occurredAtTimestampMillis: review.occurredAtTimestampMillis,
          });
        }
        // apply durably flushes the authoritative task changes before the catalog.
        // A batch is not a cross-document transaction: a failed request may have
        // saved a prefix. Stable observation IDs make a lost response/retry safe.
        await vault.apply(mutations);
        return {
          tasks: [...(await vault.getTaskProjections(taskIDs)).tasks.values()],
          acceptedRequestIDs: batch.reviews.map(({ requestID }) => requestID),
        };
      },
    );
  }
}

export function embeddedReviewObservationID(
  review: Pick<EmbeddedReviewSubmission, "sessionID" | "requestID">,
): ObservationID {
  return ("thin-embed/" +
    createHash("sha256")
      .update(JSON.stringify([review.sessionID, review.requestID]))
      .digest("hex")) as ObservationID;
}

function decodeBatch(value: unknown): EmbeddedReviewBatch {
  const raw = object(value);
  exactKeys(raw, ["reviews", "attachments"]);
  const reviews = array(raw.reviews).map((value) => {
    const review = object(value);
    exactKeys(review, [
      "requestID",
      "sessionID",
      "taskID",
      "componentID",
      "outcome",
      "occurredAtTimestampMillis",
      "taskSeed",
    ]);
    const seed = object(review.taskSeed);
    exactKeys(seed, [
      "taskID",
      "createdAtTimestampMillis",
      "spec",
      "provenance",
      "metadata",
    ]);
    let decoded;
    try {
      decoded = decodeTask(
        {
          ...seed,
          spec: JSON.stringify(seed.spec),
          provenance:
            seed.provenance === null ? null : JSON.stringify(seed.provenance),
          metadata: seed.metadata ?? {},
          isDeleted: false,
        },
        "$taskSeed",
      );
    } catch {
      throw new TypeError("Invalid task seed");
    }
    const id = taskID(review.taskID);
    if (
      taskID(seed.taskID) !== id ||
      !componentIDsForTaskSpec(decoded.spec).includes(
        String(review.componentID),
      )
    )
      throw new TypeError("Task/component mismatch");
    if (
      review.outcome !== TaskRepetitionOutcome.Remembered &&
      review.outcome !== TaskRepetitionOutcome.Forgotten
    )
      throw new TypeError("Unsupported review outcome");
    return {
      requestID: shortString(review.requestID),
      sessionID: shortString(review.sessionID),
      taskID: id,
      componentID: shortString(review.componentID),
      outcome: review.outcome,
      occurredAtTimestampMillis: timestamp(review.occurredAtTimestampMillis),
      taskSeed: {
        taskID: id,
        createdAtTimestampMillis: timestamp(decoded.createdAtTimestampMillis),
        spec: decoded.spec,
        provenance: decoded.provenance,
        metadata: decoded.metadata,
      },
    };
  });
  const attachments =
    raw.attachments === undefined
      ? []
      : array(raw.attachments).map((value) => {
          const attachment = object(value);
          exactKeys(attachment, [
            "attachmentID",
            "mediaTypeHint",
            "bytesBase64",
          ]);
          const bytesBase64 = attachment.bytesBase64;
          if (
            typeof bytesBase64 !== "string" ||
            bytesBase64.length % 4 !== 0 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(bytesBase64) ||
            Buffer.from(bytesBase64, "base64").toString("base64") !==
              bytesBase64
          )
            throw new TypeError("Invalid base64");
          const hint = attachment.mediaTypeHint;
          if (
            hint !== undefined &&
            !Object.values(AttachmentMIMEType).includes(
              hint as AttachmentMIMEType,
            )
          )
            throw new TypeError("Invalid MIME hint");
          return {
            attachmentID: taskID(
              attachment.attachmentID,
            ) as unknown as AttachmentID,
            mediaTypeHint: hint as AttachmentMIMEType | undefined,
            bytesBase64,
          };
        });
  if (
    attachments.reduce(
      (total, attachment) =>
        total + Buffer.byteLength(attachment.bytesBase64, "base64"),
      0,
    ) > maximumEmbeddedAttachmentBytes
  )
    throw new EmbeddedBodyTooLargeError();
  const references = new Set(
    reviews.flatMap((review) => referencedAttachmentIDs(review.taskSeed.spec)),
  );
  if (attachments.some(({ attachmentID }) => !references.has(attachmentID)))
    throw new TypeError("Unreferenced attachment");
  for (const attachment of attachments) {
    try {
      assertSafeAttachmentBytes({
        bytes: new Uint8Array(Buffer.from(attachment.bytesBase64, "base64")),
        mediaTypeHint: attachment.mediaTypeHint,
      });
    } catch {
      throw new TypeError("Unsafe attachment");
    }
  }
  return { reviews, attachments };
}

export class EmbeddedBodyTooLargeError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Object required");
  return value as Record<string, unknown>;
}
function exactKeys(
  value: Record<string, unknown>,
  permitted: readonly string[],
) {
  if (Object.keys(value).some((key) => !permitted.includes(key)))
    throw new TypeError("Unexpected field");
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length > maximumEmbeddedReviewBatchSize)
    throw new TypeError("Bounded array required");
  return value;
}
function taskID(value: unknown): TaskID {
  if (typeof value !== "string" || !/^[0-9a-zA-Z_\-]{22}$/.test(value))
    throw new TypeError("Invalid ID");
  return value as TaskID;
}
function shortString(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 256)
    throw new TypeError("Short string required");
  return value;
}
function timestamp(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Date.now() + 86_400_000
  )
    throw new TypeError("Invalid timestamp");
  return value;
}
