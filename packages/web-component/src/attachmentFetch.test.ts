import {
  AttachmentMIMEType,
  maximumAttachmentByteLength,
  type AttachmentID,
} from "@withorbit/core";
import { expect, test } from "bun:test";
import { fetchEmbeddedAttachment } from "./attachmentFetch.js";

const attachmentID = "attachment000000000000" as AttachmentID;

test("never forwards credentials across an attachment redirect", async () => {
  const credentials: RequestCredentials[] = [];
  const fetchImpl = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    credentials.push(init?.credentials ?? "same-origin");
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { "content-type": "image/png; charset=binary" },
    });
  }) as unknown as typeof fetch;

  const sameOrigin = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "/image.png",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl,
  });
  const crossOrigin = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "https://cdn.example/image.png",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl,
  });

  expect(credentials).toEqual(["same-origin", "same-origin"]);
  expect(sameOrigin).toMatchObject({
    status: "ok",
    mediaTypeHint: AttachmentMIMEType.PNG,
  });
  expect(crossOrigin.status).toBe("ok");
});

test("rejects declared attachments over the 10 MiB bound", async () => {
  const result = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "/huge.png",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl: (async () =>
      new Response(new Uint8Array(), {
        headers: {
          "content-length": String(maximumAttachmentByteLength + 1),
        },
      })) as unknown as typeof fetch,
  });
  expect(result).toMatchObject({ status: "error", code: "too-large" });
});

test("reports timeout and CORS-style network failures separately", async () => {
  const timeout = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "/slow.png",
    publisherBaseURL: "https://publisher.example/article",
    timeoutMillis: 1,
    fetchImpl: ((
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("abort")),
        );
      })) as unknown as typeof fetch,
  });
  const network = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "https://no-cors.example/image.png",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl: (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch,
  });

  expect(timeout).toMatchObject({ status: "error", code: "timeout" });
  expect(network).toMatchObject({ status: "error", code: "network" });
});

test("allows data URLs but rejects unsupported schemes", async () => {
  const data = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "data:image/png;base64,iVBORw0KGgo=",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl: (async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      })) as unknown as typeof fetch,
  });
  let didFetch = false;
  const result = await fetchEmbeddedAttachment({
    attachmentID,
    sourceURL: "file:///private/image.png",
    publisherBaseURL: "https://publisher.example/article",
    fetchImpl: (async () => {
      didFetch = true;
      return new Response();
    }) as unknown as typeof fetch,
  });
  expect(data.status).toBe("ok");
  expect(didFetch).toBe(false);
  expect(result).toMatchObject({ status: "error", code: "invalid-url" });
});
