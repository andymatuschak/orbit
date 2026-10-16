import { expect, test } from "bun:test";
import { defaultOrbitSchedulerPolicy } from "@withorbit/core";
import { decodePerTaskVaultCatalog, decodeScheduler } from "./perTaskCodec.js";

test.each([{}, { extraField: "ignored" }])(
  "catalog decoding ignores additional derived fields: %j",
  (extraFields) => {
    const entry = {
      documentURL: "automerge:task",
      nextDueTimestampMillis: 123,
      isDeleted: false,
      indexedTaskHeads: ["head"],
    };
    const packed = JSON.stringify({ ...entry, ...extraFields });
    const raw = {
      documentType: "com.withorbit.vault-task-catalog",
      schemaVersion: 2,
      vaultID: "vault",
      generation: 0,
      predecessorDocumentURL: null,
      entries: { task: packed },
    };
    expect(decodePerTaskVaultCatalog(raw).entries.task).toEqual(entry);
    // Decoding is a read, not an implicit catalog rewrite.
    expect(raw.entries.task).toBe(packed);
    expect(() =>
      decodePerTaskVaultCatalog({
        ...raw,
        entries: {
          task: JSON.stringify({ ...entry, nextDueTimestampMillis: null }),
        },
      }),
    ).toThrow("nextDueTimestampMillis");
  },
);

function catalogWithFSRS(fsrs: unknown) {
  return {
    documentType: "com.withorbit.vault-task-catalog",
    schemaVersion: 2,
    vaultID: "vault",
    generation: 0,
    predecessorDocumentURL: null,
    entries: {
      task: JSON.stringify({
        documentURL: "automerge:task",
        nextDueTimestampMillis: 123,
        isDeleted: false,
        indexedTaskHeads: ["head"],
        fsrs,
      }),
    },
  };
}

test.each([
  { reviewCount: 0, memory: null },
  {
    reviewCount: 3,
    memory: { stability: 42.5, lastReviewTimestampMillis: 123 },
  },
  {
    reviewCount: 4,
    memory: { stability: 2, lastReviewTimestampMillis: 456, isRetry: true },
  },
])("catalog preserves optional derived FSRS priority: %j", (fsrs) => {
  expect(
    decodePerTaskVaultCatalog(catalogWithFSRS(fsrs)).entries.task.fsrs,
  ).toEqual(fsrs);
});

test.each([
  null,
  {},
  { reviewCount: -1, memory: null },
  { reviewCount: 0.5, memory: null },
  { reviewCount: "1", memory: null },
  { reviewCount: 0 },
  { reviewCount: 0, memory: {} },
  { reviewCount: 0, memory: { stability: 0, lastReviewTimestampMillis: 0 } },
  { reviewCount: 0, memory: { stability: -1, lastReviewTimestampMillis: 0 } },
  {
    reviewCount: 0,
    memory: { stability: Infinity, lastReviewTimestampMillis: 0 },
  },
  { reviewCount: 0, memory: { stability: 1, lastReviewTimestampMillis: NaN } },
  {
    reviewCount: 0,
    memory: { stability: 1, lastReviewTimestampMillis: 0, isRetry: false },
  },
])("catalog rejects malformed FSRS priority: %j", (fsrs) => {
  expect(() => decodePerTaskVaultCatalog(catalogWithFSRS(fsrs))).toThrow(
    "fsrs",
  );
});

const fsrsPolicy = {
  kind: "fsrs",
  version: 1,
  modelVersion: 6,
  weights: [
    1, 1, 1, 1, 5, 1, 1, 0.1, 1, 0.5, 1, 1, 0.1, 0.5, 1, 0.5, 1, 0.5, 0.5, 0.5,
    0.5,
  ],
  requestedRetention: 0.9,
  cutoverTimestampMillis: 1_792_000_000_000,
  previousPolicy: defaultOrbitSchedulerPolicy,
};

test("scheduler decoding supports pinned FSRS-6 and original Orbit policies", () => {
  expect(decodeScheduler(fsrsPolicy, "$scheduler")).toEqual(fsrsPolicy);
  expect(decodeScheduler(defaultOrbitSchedulerPolicy, "$scheduler")).toEqual(
    defaultOrbitSchedulerPolicy,
  );
});

test.each([
  { modelVersion: 5 },
  { version: 2 },
  { weights: Array(19).fill(1) },
  { weights: [...Array(20).fill(1), NaN] },
  { weights: [...Array(20).fill(1), Infinity] },
  { weights: [...Array(20).fill(1), "1"] },
  { requestedRetention: 0 },
  { requestedRetention: 1.01 },
  { requestedRetention: NaN },
  { cutoverTimestampMillis: Infinity },
  { cutoverTimestampMillis: -1 },
  { cutoverTimestampMillis: 0.5 },
  { weights: [...fsrsPolicy.weights.slice(0, 20), 0.9] },
  { previousPolicy: fsrsPolicy },
])("invalid FSRS policy is rejected: %j", (replacement) => {
  expect(() =>
    decodeScheduler({ ...fsrsPolicy, ...replacement }, "$scheduler"),
  ).toThrow();
});
