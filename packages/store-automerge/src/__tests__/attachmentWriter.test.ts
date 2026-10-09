import { Repo } from "@automerge/automerge-repo";
import {
  AttachmentMIMEType,
  type AttachmentID,
  type AttachmentSHA256,
} from "@withorbit/core";
import { expect, test } from "bun:test";
import {
  AutomergeAttachmentWriter,
  RepoAutomergeAttachmentWriter,
} from "../attachmentWriter.js";
import { MemoryAutomergeBinaryStorage } from "../binaryStorage.js";
import {
  BinaryPerTaskDocuments,
  RepoPerTaskDocuments,
} from "../repoPerTaskDocuments.js";

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const input = {
  attachmentID: "attachment" as AttachmentID,
  bytes,
  mediaTypeHint: AttachmentMIMEType.PNG,
};

test.each(["binary", "repo"])(
  "%s attachment reads verify the same hash, length, and MIME identity",
  async (adapter) => {
    const storage = new MemoryAutomergeBinaryStorage();
    const repo = new Repo();
    const writer =
      adapter === "binary"
        ? new AutomergeAttachmentWriter(storage)
        : new RepoAutomergeAttachmentWriter(repo);
    const documents =
      adapter === "binary"
        ? new BinaryPerTaskDocuments(storage)
        : new RepoPerTaskDocuments(repo);
    try {
      const prepared = await writer.prepare(input);
      expect(Object.keys(prepared).sort()).toEqual([
        "attachmentID",
        "catalogEntry",
      ]);
      expect(await writer.prepare(input)).toEqual(prepared);
      const attachment = prepared.catalogEntry;
      expect(await documents.readAttachment(attachment)).toEqual({
        bytes,
        mediaType: AttachmentMIMEType.PNG,
      });
      for (const [invalid, error] of [
        [
          { hash: ("sha256:" + "0".repeat(64)) as AttachmentSHA256 },
          "hash mismatch",
        ],
        [{ byteLength: bytes.byteLength + 1 }, "byte length mismatch"],
        [{ mediaType: AttachmentMIMEType.JPEG }, "MIME hint"],
      ] as const) {
        await expect(
          documents.readAttachment({ ...attachment, ...invalid }),
        ).rejects.toThrow(error);
      }
    } finally {
      await documents.close();
      await repo.shutdown();
    }
  },
);

test("attachment preparation does not return before a failed durable save", async () => {
  const writer = new AutomergeAttachmentWriter({
    async load() {
      return undefined;
    },
    async save() {
      throw new Error("durable save failed");
    },
  });
  await expect(writer.prepare(input)).rejects.toThrow("durable save failed");
});
