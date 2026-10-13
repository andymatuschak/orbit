import type { AutomergeDocumentURL } from "@withorbit/core";
import { normalizeLabOrigin } from "../vault/labConnection.js";

// Browser fetch rejects a class-method receiver; retain the global call boundary.
const defaultFetch = ((...args: Parameters<typeof fetch>) =>
  fetch(...args)) as typeof fetch;

/** Only used for explicit first pairing, never on cached startup. */
export class LabHTTPClient {
  private readonly serviceOrigin: string;
  constructor(
    serviceOrigin: string,
    private readonly fetchImplementation: typeof fetch = defaultFetch,
  ) {
    this.serviceOrigin = normalizeLabOrigin(serviceOrigin);
  }

  async resolveRoot(token: string): Promise<AutomergeDocumentURL> {
    // React Native's AbortSignal polyfill has no static timeout() helper.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImplementation(
        new URL("/v1/root", this.serviceOrigin),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{}",
          cache: "no-store",
          credentials: "omit",
          referrerPolicy: "no-referrer",
          signal: controller.signal,
        },
      );
      if (!response.ok)
        throw new Error(`Could not pair with Orbit Lab (${response.status}).`);
      const value: unknown = await response.json();
      if (
        value === null ||
        typeof value !== "object" ||
        !("rootDocumentURL" in value) ||
        typeof value.rootDocumentURL !== "string" ||
        !value.rootDocumentURL.startsWith("automerge:")
      ) {
        throw new Error("The Lab server returned an invalid root document.");
      }
      return value.rootDocumentURL as AutomergeDocumentURL;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function hostedSyncWebSocketURL(serviceOrigin: string) {
  const url = new URL(normalizeLabOrigin(serviceOrigin));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/sync";
  return url.toString();
}
