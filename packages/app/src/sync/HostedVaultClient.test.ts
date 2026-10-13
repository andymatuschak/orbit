import { describe, expect, test } from "bun:test";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { LabHTTPClient, hostedSyncWebSocketURL } from "./HostedVaultClient.js";

describe("private Lab pairing", () => {
  test("sends the paired credential only in a Bearer header", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const client = new LabHTTPClient("https://laptop.example.test", ((
      url: URL,
      init: RequestInit,
    ) => {
      requests.push({ url: String(url), init });
      return Promise.resolve(
        Response.json({ rootDocumentURL: "automerge:root" }),
      );
    }) as unknown as typeof fetch);
    expect(await client.resolveRoot("private-key")).toBe(
      "automerge:root" as AutomergeDocumentURL,
    );
    expect(requests[0].url).toBe("https://laptop.example.test/v1/root");
    expect(requests[0].init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { Authorization: "Bearer private-key" },
    });
    expect(requests[0].url).not.toContain("private-key");
  });

  test("refuses invalid responses and failed pairing rather than a public fallback", async () => {
    const client = (response: Response) =>
      new LabHTTPClient("http://localhost:8787", (() =>
        Promise.resolve(response)) as unknown as typeof fetch);
    await expect(
      client(Response.json({ surprise: true })).resolveRoot("key"),
    ).rejects.toThrow("invalid root");
    await expect(
      client(new Response("denied", { status: 401 })).resolveRoot("key"),
    ).rejects.toThrow("401");
  });

  test("the default fetch function is called without a browser-illegal receiver", async () => {
    const original = globalThis.fetch;
    let receiver: unknown = "not-called";
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        Response.json({ rootDocumentURL: "automerge:root" }),
      );
    } as unknown as typeof fetch;
    try {
      await new LabHTTPClient("https://laptop.example.test").resolveRoot("key");
      expect(receiver).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });

  test("uses the private origin for WebSocket sync", () => {
    expect(hostedSyncWebSocketURL("https://laptop.example.test")).toBe(
      "wss://laptop.example.test/v1/sync",
    );
    expect(hostedSyncWebSocketURL("http://127.0.0.1:8787")).toBe(
      "ws://127.0.0.1:8787/v1/sync",
    );
  });
});
