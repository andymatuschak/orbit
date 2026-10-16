import {
  AttachmentMIMEType,
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  validateFSRSSchedulerPolicy,
  type AttachmentID,
  type TaskID,
  type TaskProvenance,
  type TaskSpec,
} from "@withorbit/core";
import type { PerTaskCatalogEntry as SharedPerTaskCatalogEntry } from "./perTaskVault.js";
import type {
  AutomergeDocumentURL,
  ObservationID,
  SchedulerPolicy,
  SchedulingObservation,
  VaultAttachment,
  VaultID,
  VaultTask,
} from "@withorbit/core";

/** Plain schema-2 decoding shared by Repo JS and Repo Swift; no Wasm dependency. */
export interface CatalogGenerationDescriptor {
  generation: number;
  documentURL: AutomergeDocumentURL;
  predecessorDocumentURL: AutomergeDocumentURL | null;
  initialCatalogHeads: string[];
}

export type PerTaskCatalogEntry = SharedPerTaskCatalogEntry;

export interface PerTaskVaultRoot {
  documentType: "com.withorbit.vault-root";
  schemaVersion: 2;
  vaultID: VaultID;
  createdAtTimestampMillis: number;
  scheduler: SchedulerPolicy;
  attachments: Record<AttachmentID, VaultAttachment>;
  catalogCandidates: CatalogGenerationDescriptor[];
}

export interface PerTaskVaultCatalog {
  documentType: "com.withorbit.vault-task-catalog";
  schemaVersion: 2;
  vaultID: VaultID;
  generation: number;
  predecessorDocumentURL: AutomergeDocumentURL | null;
  entries: Record<TaskID, PerTaskCatalogEntry>;
}

export interface PerTaskVaultTask {
  documentType: "com.withorbit.vault-task";
  schemaVersion: 2;
  vaultID: VaultID;
  taskID: TaskID;
  task: VaultTask;
  observations: Record<ObservationID, SchedulingObservation>;
}

export function decodePerTaskVaultRoot(value: unknown): PerTaskVaultRoot {
  const raw = record(value, "$root");
  literal(raw.documentType, "com.withorbit.vault-root", "$root.documentType");
  literal(raw.schemaVersion, 2, "$root.schemaVersion");
  const candidates = Object.values(
    record(raw.catalogCandidates, "$root.catalogCandidates"),
  )
    .map((entry, index) => {
      const path = `$root.catalogCandidates[${index}]`;
      const candidate = parsePackedRecord(entry, path);
      return {
        generation: nonNegativeInteger(
          candidate.generation,
          `${path}.generation`,
        ),
        documentURL: automergeURL(candidate.documentURL, `${path}.documentURL`),
        predecessorDocumentURL:
          candidate.predecessorDocumentURL === null
            ? null
            : automergeURL(
                candidate.predecessorDocumentURL,
                `${path}.predecessorDocumentURL`,
              ),
        initialCatalogHeads: stringArray(
          candidate.initialCatalogHeads,
          `${path}.initialCatalogHeads`,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.generation - left.generation ||
        left.documentURL.localeCompare(right.documentURL),
    );
  if (candidates.length === 0) throw new Error("Vault root has no catalog");
  return {
    documentType: "com.withorbit.vault-root",
    schemaVersion: 2,
    vaultID: stringValue(raw.vaultID, "$root.vaultID") as VaultID,
    createdAtTimestampMillis: finiteNumber(
      raw.createdAtTimestampMillis,
      "$root.createdAtTimestampMillis",
    ),
    scheduler: decodeScheduler(raw.scheduler, "$root.scheduler"),
    attachments: decodeEntries(
      raw.attachments,
      "$root.attachments",
      decodeAttachment,
    ) as Record<AttachmentID, VaultAttachment>,
    catalogCandidates: candidates,
  };
}

export function decodePerTaskVaultCatalog(value: unknown): PerTaskVaultCatalog {
  const raw = record(value, "$catalog");
  literal(
    raw.documentType,
    "com.withorbit.vault-task-catalog",
    "$catalog.documentType",
  );
  literal(raw.schemaVersion, 2, "$catalog.schemaVersion");
  return {
    documentType: "com.withorbit.vault-task-catalog",
    schemaVersion: 2,
    vaultID: stringValue(raw.vaultID, "$catalog.vaultID") as VaultID,
    generation: nonNegativeInteger(raw.generation, "$catalog.generation"),
    predecessorDocumentURL:
      raw.predecessorDocumentURL === null
        ? null
        : automergeURL(
            raw.predecessorDocumentURL,
            "$catalog.predecessorDocumentURL",
          ),
    entries: decodeEntries(raw.entries, "$catalog.entries", (entry, path) => {
      const decoded = parsePackedRecord(entry, path);
      return {
        documentURL: automergeURL(decoded.documentURL, `${path}.documentURL`),
        nextDueTimestampMillis: finiteNumber(
          decoded.nextDueTimestampMillis,
          `${path}.nextDueTimestampMillis`,
        ),
        isDeleted: booleanValue(decoded.isDeleted, `${path}.isDeleted`),
        indexedTaskHeads: stringArray(
          decoded.indexedTaskHeads,
          `${path}.indexedTaskHeads`,
        ),
        ...(decoded.fsrs === undefined
          ? {}
          : { fsrs: decodeCatalogFSRS(decoded.fsrs, `${path}.fsrs`) }),
      };
    }) as Record<TaskID, PerTaskCatalogEntry>,
  };
}

function decodeCatalogFSRS(
  value: unknown,
  path: string,
): NonNullable<PerTaskCatalogEntry["fsrs"]> {
  const raw = record(value, path);
  const memory =
    raw.memory === null ? null : record(raw.memory, `${path}.memory`);
  if (memory?.isRetry !== undefined)
    literal(memory.isRetry, true, `${path}.memory.isRetry`);
  return {
    reviewCount: nonNegativeInteger(raw.reviewCount, `${path}.reviewCount`),
    memory:
      memory === null
        ? null
        : {
            stability: positiveNumber(
              memory.stability,
              `${path}.memory.stability`,
            ),
            lastReviewTimestampMillis: finiteNumber(
              memory.lastReviewTimestampMillis,
              `${path}.memory.lastReviewTimestampMillis`,
            ),
            ...(memory.isRetry === true ? { isRetry: true } : {}),
          },
  };
}

export function decodePerTaskVaultTask(value: unknown): PerTaskVaultTask {
  const raw = record(value, "$taskDocument");
  literal(
    raw.documentType,
    "com.withorbit.vault-task",
    "$taskDocument.documentType",
  );
  literal(raw.schemaVersion, 2, "$taskDocument.schemaVersion");
  return {
    documentType: "com.withorbit.vault-task",
    schemaVersion: 2,
    vaultID: stringValue(raw.vaultID, "$taskDocument.vaultID") as VaultID,
    taskID: stringValue(raw.taskID, "$taskDocument.taskID") as TaskID,
    task: decodeTask(raw.task, "$taskDocument.task"),
    observations: decodeEntries(
      raw.observations,
      "$taskDocument.observations",
      decodeObservation,
    ) as Record<ObservationID, SchedulingObservation>,
  };
}

export function decodeTask(value: unknown, path: string): VaultTask {
  const raw = record(value, path);
  return {
    createdAtTimestampMillis: finiteNumber(
      raw.createdAtTimestampMillis,
      `${path}.createdAtTimestampMillis`,
    ),
    spec: decodeTaskSpec(raw.spec, `${path}.spec`),
    provenance:
      raw.provenance === null
        ? null
        : decodeTaskProvenance(raw.provenance, `${path}.provenance`),
    metadata: Object.fromEntries(
      Object.entries(record(raw.metadata, `${path}.metadata`)).map(
        ([key, entry]) => [key, stringValue(entry, `${path}.metadata.${key}`)],
      ),
    ),
    isDeleted: booleanValue(raw.isDeleted, `${path}.isDeleted`),
  };
}

function decodeTaskSpec(value: unknown, path: string): TaskSpec {
  const decoded = parsePackedRecord(value, path);
  literal(decoded.type, TaskSpecType.Memory, `${path}.type`);
  const content = record(decoded.content, `${path}.content`);
  const contentType = stringValue(content.type, `${path}.content.type`);
  if (
    !Object.values(TaskContentType).includes(contentType as TaskContentType)
  ) {
    invalid(`${path}.content.type`, "known task content type");
  }
  decodeContentField(content.body, `${path}.content.body`);
  if (contentType === TaskContentType.QA) {
    decodeContentField(content.answer, `${path}.content.answer`);
  }
  if (contentType === TaskContentType.Cloze) {
    for (const [componentID, componentValue] of Object.entries(
      record(content.components, `${path}.content.components`),
    )) {
      const component = record(
        componentValue,
        `${path}.content.components.${componentID}`,
      );
      finiteNumber(
        component.order,
        `${path}.content.components.${componentID}.order`,
      );
      arrayValue(
        component.ranges,
        `${path}.content.components.${componentID}.ranges`,
      ).forEach((rangeValue, index) => {
        const range = record(
          rangeValue,
          `${path}.content.components.${componentID}.ranges[${index}]`,
        );
        nonNegativeInteger(range.startIndex, `${path}.range.startIndex`);
        nonNegativeInteger(range.length, `${path}.range.length`);
        if (range.hint !== null && typeof range.hint !== "string") {
          invalid(`${path}.range.hint`, "string or null");
        }
      });
    }
  }
  return decoded as unknown as TaskSpec;
}

function decodeTaskProvenance(value: unknown, path: string): TaskProvenance {
  const decoded = parsePackedRecord(value, path);
  stringValue(decoded.identifier, `${path}.identifier`);
  return decoded as unknown as TaskProvenance;
}

export function decodeObservation(
  value: unknown,
  path: string,
): SchedulingObservation {
  const tuple = arrayValue(parsePacked(value, path), path);
  const taskID = stringValue(tuple[1], `${path}[1]`) as TaskID;
  const componentID = stringValue(tuple[2], `${path}[2]`);
  const occurredAtTimestampMillis = finiteNumber(tuple[3], `${path}[3]`);
  if (tuple[0] === "r" && tuple.length === 6) {
    const outcome = stringValue(tuple[5], `${path}[5]`);
    if (
      !Object.values(TaskRepetitionOutcome).includes(
        outcome as TaskRepetitionOutcome,
      )
    ) {
      invalid(`${path}[5]`, "known repetition outcome");
    }
    return {
      kind: "review",
      taskID,
      componentID,
      occurredAtTimestampMillis,
      reviewSessionID:
        tuple[4] === null ? null : stringValue(tuple[4], `${path}[4]`),
      outcome: outcome as TaskRepetitionOutcome,
    };
  }
  if (tuple[0] === "s" && tuple.length === 5) {
    return {
      kind: "reschedule",
      taskID,
      componentID,
      occurredAtTimestampMillis,
      newDueTimestampMillis: finiteNumber(tuple[4], `${path}[4]`),
    };
  }
  invalid(path, "packed review or reschedule tuple");
}

export function decodeScheduler(value: unknown, path: string): SchedulerPolicy {
  const raw = record(value, path);
  const kind = stringValue(raw.kind, `${path}.kind`);
  literal(raw.version, 1, `${path}.version`);
  if (kind === "orbit-sm2-like") {
    return {
      kind,
      version: 1,
      intervalGrowthFactor: positiveNumber(
        raw.intervalGrowthFactor,
        `${path}.intervalGrowthFactor`,
      ),
      initialReviewIntervalMillis: nonNegativeInteger(
        raw.initialReviewIntervalMillis,
        `${path}.initialReviewIntervalMillis`,
      ),
    };
  }
  if (kind === "fsrs") {
    literal(raw.modelVersion, 6, `${path}.modelVersion`);
    const weights = arrayValue(raw.weights, `${path}.weights`).map(
      (weight, index) => finiteNumber(weight, `${path}.weights[${index}]`),
    );
    if (weights.length !== 21) invalid(`${path}.weights`, "21 FSRS-6 weights");
    const requestedRetention = positiveNumber(
      raw.requestedRetention,
      `${path}.requestedRetention`,
    );
    if (requestedRetention > 1)
      invalid(`${path}.requestedRetention`, "at most 1");
    const previousPolicy = decodeScheduler(
      raw.previousPolicy,
      `${path}.previousPolicy`,
    );
    if (previousPolicy.kind !== "orbit-sm2-like") {
      invalid(`${path}.previousPolicy`, "original Orbit scheduler");
    }
    const policy: SchedulerPolicy = {
      kind,
      version: 1,
      modelVersion: 6,
      weights,
      requestedRetention,
      cutoverTimestampMillis: nonNegativeInteger(
        raw.cutoverTimestampMillis,
        `${path}.cutoverTimestampMillis`,
      ),
      previousPolicy,
    };
    validateFSRSSchedulerPolicy(policy);
    return policy;
  }
  invalid(path, "supported Orbit or FSRS-6 scheduler");
}

export function decodeAttachment(
  value: unknown,
  path: string,
): VaultAttachment {
  const raw = record(value, path);
  const hash = stringValue(raw.hash, `${path}.hash`);
  if (!/^sha256:[0-9a-f]{64}$/.test(hash)) invalid(`${path}.hash`, "SHA-256");
  const documentURL = stringValue(raw.documentURL, `${path}.documentURL`);
  if (!documentURL.startsWith("automerge:")) {
    invalid(`${path}.documentURL`, "Automerge URL");
  }
  const mediaType = stringValue(raw.mediaType, `${path}.mediaType`);
  if (
    !Object.values(AttachmentMIMEType).includes(mediaType as AttachmentMIMEType)
  ) {
    invalid(`${path}.mediaType`, "supported attachment MIME type");
  }
  return {
    hash: hash as VaultAttachment["hash"],
    documentURL: documentURL as AutomergeDocumentURL,
    mediaType: mediaType as AttachmentMIMEType,
    byteLength: nonNegativeInteger(raw.byteLength, `${path}.byteLength`),
  };
}

function decodeContentField(value: unknown, path: string) {
  const raw = record(value, path);
  stringValue(raw.text, `${path}.text`);
  arrayValue(raw.attachments, `${path}.attachments`).forEach((entry, index) =>
    stringValue(entry, `${path}.attachments[${index}]`),
  );
}

function parsePacked(value: unknown, path: string): unknown {
  const encoded = stringValue(value, path);
  try {
    return JSON.parse(encoded) as unknown;
  } catch {
    invalid(path, "valid packed JSON string");
  }
}

function parsePackedRecord(value: unknown, path: string) {
  return record(parsePacked(value, path), path);
}

function decodeEntries<T>(
  value: unknown,
  path: string,
  decode: (entry: unknown, entryPath: string) => T,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record(value, path)).map(([key, entry]) => [
      key,
      decode(entry, `${path}[${JSON.stringify(key)}]`),
    ]),
  );
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(path, "object");
  }
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "array");
  return value;
}

function stringValue(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "string");
  return value;
}

function stringArray(value: unknown, path: string): string[] {
  return arrayValue(value, path).map((entry, index) =>
    stringValue(entry, `${path}[${index}]`),
  );
}

function automergeURL(value: unknown, path: string): AutomergeDocumentURL {
  const decoded = stringValue(value, path);
  if (!decoded.startsWith("automerge:")) invalid(path, "Automerge URL");
  return decoded as AutomergeDocumentURL;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "boolean");
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(path, "finite number");
  }
  return value;
}

function safeInteger(value: unknown, path: string): number {
  const decoded = finiteNumber(value, path);
  if (!Number.isSafeInteger(decoded)) invalid(path, "safe integer");
  return decoded;
}

function nonNegativeInteger(value: unknown, path: string): number {
  const decoded = safeInteger(value, path);
  if (decoded < 0) invalid(path, "non-negative integer");
  return decoded;
}

function positiveNumber(value: unknown, path: string): number {
  const decoded = finiteNumber(value, path);
  if (decoded <= 0) invalid(path, "positive number");
  return decoded;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) invalid(path, JSON.stringify(expected));
}

function invalid(path: string, expectation: string): never {
  throw new Error(`Invalid packed vault at ${path}: expected ${expectation}`);
}
