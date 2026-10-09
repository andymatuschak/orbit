import {
  ImmutableString,
  isImmutableString,
  type AutomergeValue,
} from "@automerge/automerge";
import type { OrbitAttachmentDocument } from "@withorbit/core";
export interface RawAttachmentDocument {
  [key: string]: AutomergeValue;
  documentType: ImmutableString;
  schemaVersion: number;
  bytes: Uint8Array;
}

export class VaultCodecError extends Error {
  constructor(path: string, expectation: string) {
    super(
      "Invalid Automerge vault value at " + path + ": expected " + expectation,
    );
    this.name = "VaultCodecError";
  }
}

export function encodeAttachmentDocument(
  attachment: OrbitAttachmentDocument,
): RawAttachmentDocument {
  return {
    documentType: new ImmutableString(attachment.documentType),
    schemaVersion: 1,
    bytes: Uint8Array.from(attachment.bytes),
  };
}
export function decodeAttachmentDocument(
  value: unknown,
): OrbitAttachmentDocument {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new VaultCodecError("$attachmentDocument", "attachment object");
  const raw = value as Record<string, unknown>;
  if (
    !isImmutableString(raw.documentType) ||
    raw.documentType.toString() !== "com.withorbit.attachment" ||
    raw.schemaVersion !== 1
  ) {
    throw new VaultCodecError(
      "$attachmentDocument",
      "supported attachment document",
    );
  }
  if (!(raw.bytes instanceof Uint8Array))
    throw new VaultCodecError("$attachmentDocument.bytes", "Uint8Array");
  return {
    documentType: "com.withorbit.attachment",
    schemaVersion: 1,
    bytes: Uint8Array.from(raw.bytes),
  };
}

export function encodeAtomicTree(value: unknown): AutomergeValue {
  if (typeof value === "string") return new ImmutableString(value);
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (Array.isArray(value)) return value.map(encodeAtomicTree);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, encodeAtomicTree(entry)]),
    );
  }
  throw new VaultCodecError(
    "$encode",
    "JSON-compatible value without undefined",
  );
}

export function decodeAtomicTree(value: unknown, path: string): unknown {
  if (isImmutableString(value)) return value.toString();
  if (Array.isArray(value))
    return value.map((entry, index) =>
      decodeAtomicTree(entry, path + "[" + index + "]"),
    );
  if (value === null || typeof value === "number" || typeof value === "boolean")
    return value;
  if (value && typeof value === "object" && !(value instanceof Uint8Array)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        decodeAtomicTree(entry, path + "." + key),
      ]),
    );
  }
  throw new VaultCodecError(path, "atomic-string JSON value");
}
