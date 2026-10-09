import {
  AttachmentMIMEType,
  maximumAttachmentByteLength,
  type AttachmentID,
} from "@withorbit/core";
import type { EmbeddedAttachmentResponseResult } from "@withorbit/embedded-support";

export interface EmbeddedAttachmentFetchDiagnostic {
  attachmentID: AttachmentID;
  publisherOrigin: string;
  sourceOrigin: string | null;
  finalOrigin: string | null;
  outcome: "ok" | "invalid-url" | "network" | "http" | "too-large" | "timeout";
  byteLength: number | null;
  elapsedMillis: number;
}

export async function fetchEmbeddedAttachment(input: {
  attachmentID: AttachmentID;
  sourceURL: string;
  publisherBaseURL: string;
  timeoutMillis?: number;
  fetchImpl?: typeof fetch;
  onDiagnostic?: (value: EmbeddedAttachmentFetchDiagnostic) => void;
}): Promise<EmbeddedAttachmentResponseResult> {
  const startedAt = performance.now();
  let source: URL;
  try {
    source = new URL(input.sourceURL, input.publisherBaseURL);
  } catch {
    report(input, startedAt, "invalid-url", null, null, null);
    return {
      status: "error",
      code: "invalid-url",
      message: "The publisher supplied an invalid attachment URL",
    };
  }
  if (
    source.protocol !== "https:" &&
    source.protocol !== "http:" &&
    source.protocol !== "blob:" &&
    source.protocol !== "data:"
  ) {
    report(input, startedAt, "invalid-url", source.origin, source.href, null);
    return {
      status: "error",
      code: "invalid-url",
      message: "Attachment URLs must use HTTP, HTTPS, blob, or data",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("attachment request timed out"),
    input.timeoutMillis ?? 15_000,
  );
  try {
    const response = await (input.fetchImpl ?? fetch)(source, {
      // `same-origin` also strips credentials if a publisher URL redirects to
      // another origin. `include` would forward that other origin's cookies.
      credentials: "same-origin",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      report(
        input,
        startedAt,
        "http",
        source.origin,
        response.url || source.href,
        null,
      );
      return {
        status: "error",
        code: "http",
        message: `Attachment request returned HTTP ${response.status}`,
      };
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > maximumAttachmentByteLength
    ) {
      await response.body?.cancel();
      report(
        input,
        startedAt,
        "too-large",
        source.origin,
        response.url || source.href,
        declaredLength,
      );
      return tooLarge();
    }

    const bytes = await readBoundedBody(response);
    const mediaTypeHint = parseSupportedMediaType(
      response.headers.get("content-type"),
    );
    report(
      input,
      startedAt,
      "ok",
      source.origin,
      response.url || source.href,
      bytes.byteLength,
    );
    return { status: "ok", bytes: copyArrayBuffer(bytes), mediaTypeHint };
  } catch (error) {
    if (error instanceof AttachmentTooLargeError) {
      report(
        input,
        startedAt,
        "too-large",
        source.origin,
        source.href,
        error.byteLength,
      );
      return tooLarge();
    }
    const didTimeout = controller.signal.aborted;
    report(
      input,
      startedAt,
      didTimeout ? "timeout" : "network",
      source.origin,
      source.href,
      null,
    );
    return {
      status: "error",
      code: didTimeout ? "timeout" : "network",
      message: didTimeout
        ? "Attachment request timed out"
        : "The publisher could not read the attachment bytes (possibly because of CORS)",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output.buffer;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumAttachmentByteLength) {
      throw new AttachmentTooLargeError(bytes.byteLength);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumAttachmentByteLength) {
        await reader.cancel();
        throw new AttachmentTooLargeError(byteLength);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseSupportedMediaType(
  value: string | null,
): AttachmentMIMEType | null {
  const normalized = value?.split(";", 1)[0].trim().toLowerCase();
  switch (normalized) {
    case AttachmentMIMEType.PNG:
      return AttachmentMIMEType.PNG;
    case AttachmentMIMEType.JPEG:
      return AttachmentMIMEType.JPEG;
    case AttachmentMIMEType.SVG:
      return AttachmentMIMEType.SVG;
    default:
      return null;
  }
}

function tooLarge(): EmbeddedAttachmentResponseResult {
  return {
    status: "error",
    code: "too-large",
    message: "Attachment exceeds Orbit's 10 MiB limit",
  };
}

class AttachmentTooLargeError extends Error {
  constructor(readonly byteLength: number) {
    super("Attachment exceeds Orbit's size limit");
  }
}

function report(
  input: {
    attachmentID: AttachmentID;
    publisherBaseURL: string;
    onDiagnostic?: (value: EmbeddedAttachmentFetchDiagnostic) => void;
  },
  startedAt: number,
  outcome: EmbeddedAttachmentFetchDiagnostic["outcome"],
  sourceOrigin: string | null,
  finalURL: string | null,
  byteLength: number | null,
) {
  input.onDiagnostic?.({
    attachmentID: input.attachmentID,
    publisherOrigin: new URL(input.publisherBaseURL).origin,
    sourceOrigin,
    finalOrigin: finalURL ? new URL(finalURL).origin : null,
    outcome,
    byteLength,
    elapsedMillis: performance.now() - startedAt,
  });
}
