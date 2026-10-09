import { expect, test } from "bun:test";
import { decodePerTaskVaultCatalog } from "./perTaskCodec.js";

test.each([{}, { nextComponentID: "main", extraField: "ignored" }])(
  "catalog decoding accepts entries with or without obsolete extra fields: %j",
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
    // Ignoring a removed derived field does not rewrite an existing catalog.
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
