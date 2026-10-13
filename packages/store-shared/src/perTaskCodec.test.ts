import { expect, test } from "bun:test";
import { decodePerTaskVaultCatalog } from "./perTaskCodec.js";

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
