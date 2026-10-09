import type {
  HostedSyncCredential,
  HostedVaultControlClient,
} from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import {
  HostedVaultClient,
  HostedVaultControlError,
  HostedVaultHTTPClient,
  hostedSyncWebSocketURL,
} from "./HostedVaultClient.js";

describe("hosted vault HTTP client", () => {
  test("calls the browser fetch default without an illegal receiver", async () => {
    const originalFetch = globalThis.fetch;
    let receiver: unknown = "not-called";
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(
        Response.json({
          accountID: "account-a",
          rootDocumentURL: "automerge:root",
        }),
      );
    } as unknown as typeof fetch;
    try {
      const client = new HostedVaultHTTPClient("https://sync.example.test");
      await client.resolveHostedRoot({
        kind: "firebaseIDToken",
        token: "id",
      });
      expect(receiver).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("sends credentials only in an ID authorization header", async () => {
    const requests: Array<{ url: URL; init: RequestInit }> = [];
    const client = new HostedVaultHTTPClient(
      "https://sync.example.test",
      mockFetch(async (url, init) => {
        requests.push({ url: new URL(String(url)), init: init ?? {} });
        return Response.json({
          accountID: "account-a",
          rootDocumentURL: "automerge:root",
        });
      }),
    );
    await client.resolveHostedRoot({
      kind: "firebaseIDToken",
      token: "private-firebase-token",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url.href).toBe(
      "https://sync.example.test/v1/hosted-roots:resolve",
    );
    expect(requests[0].url.href).not.toContain("private-firebase-token");
    expect(requests[0].init).toMatchObject({
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      body: "{}",
      headers: {
        Authorization: "ID private-firebase-token",
        "Content-Type": "application/json",
      },
    });
  });

  test("validates success and structured failure responses", async () => {
    const invalid = new HostedVaultHTTPClient(
      "https://sync.example.test",
      mockFetch(async () => Response.json({ surprise: true })),
    );
    await expect(
      invalid.resolveHostedRoot({ kind: "firebaseIDToken", token: "id" }),
    ).rejects.toMatchObject({ code: "invalid-response" });

    const rejected = new HostedVaultHTTPClient(
      "https://sync.example.test",
      mockFetch(async () =>
        Response.json({ error: "legacy-account" }, { status: 409 }),
      ),
    );
    await expect(
      rejected.resolveHostedRoot({ kind: "firebaseIDToken", token: "id" }),
    ).rejects.toEqual(new HostedVaultControlError(409, "legacy-account"));
  });

  test("obtains a fresh Firebase ID token for every operation", async () => {
    const credentials: HostedSyncCredential[] = [];
    let tokenGeneration = 0;
    const control: HostedVaultControlClient = {
      async resolveHostedRoot(credential) {
        credentials.push(credential);
        return {
          accountID: "account-a",
          rootDocumentURL: "automerge:root" as AutomergeDocumentURL,
        };
      },
    };
    const client = new HostedVaultClient(control, {
      async getCurrentIDToken() {
        return `id-${++tokenGeneration}`;
      },
    });
    await client.resolveHostedRoot();
    await client.resolveHostedRoot();
    expect(await client.getSyncCredential()).toEqual({
      kind: "firebaseIDToken",
      token: "id-3",
    });
    expect(credentials.map(({ token }) => token)).toEqual(["id-1", "id-2"]);
  });

  test("rejects control operations after the signed-in user changes", async () => {
    let currentUserID = "user-a";
    let publicationCount = 0;
    const control: HostedVaultControlClient = {
      async resolveHostedRoot() {
        publicationCount++;
        throw new Error("unexpected request");
      },
    };
    const client = new HostedVaultClient(
      control,
      {
        async getUserAuthState() {
          return { userID: currentUserID };
        },
        async getCurrentIDToken() {
          currentUserID = "user-b";
          return "token-for-user-b";
        },
      },
      "user-a",
    );

    await expect(client.resolveHostedRoot()).rejects.toThrow(
      "Authenticated account changed",
    );
    expect(publicationCount).toBe(0);
  });

  test("derives the fixed WebSocket endpoint from the control origin", () => {
    expect(hostedSyncWebSocketURL("https://sync.example.test")).toBe(
      "wss://sync.example.test/v1/sync",
    );
    expect(hostedSyncWebSocketURL("http://127.0.0.1:8787")).toBe(
      "ws://127.0.0.1:8787/v1/sync",
    );
  });
});

function mockFetch(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): typeof fetch {
  return Object.assign(implementation, {
    preconnect: () => undefined,
  }) as typeof fetch;
}
