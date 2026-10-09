import * as Automerge from "@automerge/automerge";
import {
  stringifyAutomergeUrl,
  parseAutomergeUrl,
  type AutomergeUrl,
  type Repo,
  type BinaryDocumentId,
} from "@automerge/automerge-repo";
import {
  assertSafeAttachmentBytes,
  type AttachmentID,
  type AttachmentMIMEType,
  type AttachmentSHA256,
  type AutomergeDocumentURL,
  type PreparedAttachment,
  type VaultAttachmentWriter,
} from "@withorbit/core";
import type { AutomergeBinaryStorage } from "./binaryStorage.js";
import {
  decodeAttachmentDocument,
  encodeAttachmentDocument,
  type RawAttachmentDocument,
} from "./codec.js";

export class AutomergeAttachmentWriter implements VaultAttachmentWriter {
  constructor(private readonly storage: AutomergeBinaryStorage) {}

  async prepare(input: {
    attachmentID: AttachmentID;
    bytes: Uint8Array;
    mediaTypeHint?: AttachmentMIMEType;
  }): Promise<PreparedAttachment> {
    const mediaType = assertSafeAttachmentBytes(input);
    const digest = await sha256(input.bytes);
    const hash = `sha256:${digest}` as AttachmentSHA256;
    const documentURL = stringifyAutomergeUrl({
      // Keep content-addressing deterministic across JS Repo and Repo Swift,
      // whose document IDs are UUID-sized. The full SHA-256 remains the
      // authoritative content hash and Automerge actor ID.
      documentId: bytesFromHex(digest).slice(0, 16) as BinaryDocumentId,
    }) as unknown as AutomergeDocumentURL;
    // The document identity, actor, initial commit, and payload are all
    // content-derived. Recreating and merging that same history is idempotent,
    // and avoids a blocking "find missing document" round trip through Repo.
    let document = Automerge.init<RawAttachmentDocument>({ actor: digest });
    document = Automerge.change(
      document,
      // Swift's commit API cannot omit time. Pinning both implementations to
      // zero makes independently created content-addressed documents share
      // exactly the same actor history rather than forking actor sequence 1.
      { message: "initialize Orbit attachment", time: 0 },
      (draft) =>
        Object.assign(
          draft,
          encodeAttachmentDocument({
            documentType: "com.withorbit.attachment",
            schemaVersion: 1,
            bytes: input.bytes,
          }),
        ),
    );
    try {
      await this.storage.save(documentURL, Automerge.save(document));
    } finally {
      Automerge.free(document);
    }
    return {
      attachmentID: input.attachmentID,
      catalogEntry: {
        hash,
        documentURL,
        mediaType,
        byteLength: input.bytes.byteLength,
      },
    };
  }
}

/** Content-addressed attachment creation is an explicit binary import, not a vault read/write round trip. */
export class RepoAutomergeAttachmentWriter extends AutomergeAttachmentWriter {
  constructor(repo: Repo) {
    super({
      load: async () => undefined,
      save: async (url, bytes) => {
        const handle = repo.import(bytes, {
          docId: parseAutomergeUrl(url as unknown as AutomergeUrl).documentId,
        });
        await repo.flush([handle.documentId]);
      },
    });
  }
}

export async function verifyAttachmentDocument(input: {
  binary: Uint8Array;
  expectedHash: AttachmentSHA256;
  expectedByteLength: number;
  expectedMediaType: AttachmentMIMEType;
}) {
  const document = Automerge.load<RawAttachmentDocument>(input.binary);
  try {
    return await verifyAttachmentBytes({
      ...input,
      bytes: decodeAttachmentDocument(document).bytes,
    });
  } finally {
    Automerge.free(document);
  }
}

/** The live Repo and byte-backed importer verify the same content identity. */
export async function verifyAttachmentBytes(input: {
  bytes: Uint8Array;
  expectedHash: AttachmentSHA256;
  expectedByteLength: number;
  expectedMediaType: AttachmentMIMEType;
}) {
  const mediaType = assertSafeAttachmentBytes({
    bytes: input.bytes,
    mediaTypeHint: input.expectedMediaType,
  });
  if (input.bytes.byteLength !== input.expectedByteLength) {
    throw new Error("Attachment document byte length mismatch");
  }
  if (`sha256:${await sha256(input.bytes)}` !== input.expectedHash) {
    throw new Error("Attachment document hash mismatch");
  }
  return { bytes: Uint8Array.from(input.bytes), mediaType };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", copy),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("Attachment digest is not canonical SHA-256 hex");
  }
  return Uint8Array.from(
    Array.from({ length: hex.length / 2 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    ),
  );
}
