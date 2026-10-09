import type {
  HostedControlErrorBody,
  HostedSyncCredential,
  HostedVaultControlClient,
  ResolveHostedRootResponse,
} from "@withorbit/api";

const defaultFetch = ((...arguments_: Parameters<typeof fetch>) =>
  fetch(...arguments_)) as unknown as typeof fetch;

export class HostedVaultControlError extends Error {
  readonly name = "HostedVaultControlError";

  constructor(
    readonly status: number,
    readonly code: HostedControlErrorBody["error"] | "invalid-response",
  ) {
    super(`Orbit Sync request failed (${status}: ${code})`);
  }
}

export class HostedVaultHTTPClient implements HostedVaultControlClient {
  private readonly serviceOrigin: string;

  constructor(
    serviceOrigin: string,
    private readonly fetchImplementation: typeof fetch = defaultFetch,
  ) {
    const url = new URL(serviceOrigin);
    if (
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !["https:", "http:"].includes(url.protocol)
    ) {
      throw new Error("Orbit Sync service origin must be an HTTP(S) origin");
    }
    this.serviceOrigin = url.origin;
  }

  async resolveHostedRoot(credential: HostedSyncCredential) {
    const value = await this.post("/v1/hosted-roots:resolve", {}, credential);
    if (!isResolveResponse(value)) {
      throw new HostedVaultControlError(200, "invalid-response");
    }
    return value;
  }

  private async post(
    path: string,
    body: unknown,
    credential: HostedSyncCredential,
  ) {
    const response = await this.fetchImplementation(
      new URL(path, this.serviceOrigin),
      {
        method: "POST",
        headers: {
          Authorization: `ID ${credential.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok) {
      let code: HostedControlErrorBody["error"] | "invalid-response" =
        "invalid-response";
      try {
        const body: unknown = await response.json();
        if (isControlError(body)) code = body.error;
      } catch {}
      throw new HostedVaultControlError(response.status, code);
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new HostedVaultControlError(response.status, "invalid-response");
    }
  }
}

export interface IDTokenAuthenticationClient<IDToken = unknown> {
  getCurrentIDToken(): Promise<IDToken>;
  getUserAuthState?(): Promise<{ userID: string } | null>;
}

/** Obtains a current Firebase credential for each HTTPS control operation. */
export class HostedVaultClient {
  constructor(
    private readonly control: HostedVaultControlClient,
    private readonly authentication: IDTokenAuthenticationClient,
    private readonly expectedUserID?: string,
  ) {}

  resolveHostedRoot() {
    return this.withCredential((credential) =>
      this.control.resolveHostedRoot(credential),
    );
  }

  getSyncCredential() {
    return this.currentCredential();
  }

  private async withCredential<T>(
    operation: (credential: HostedSyncCredential) => Promise<T>,
  ) {
    return operation(await this.currentCredential());
  }

  private async currentCredential(): Promise<HostedSyncCredential> {
    await this.assertExpectedUser();
    const token = await this.authentication.getCurrentIDToken();
    await this.assertExpectedUser();
    return { kind: "firebaseIDToken", token: String(token) };
  }

  private async assertExpectedUser() {
    if (this.expectedUserID === undefined) return;
    const currentUser = await this.authentication.getUserAuthState?.();
    if (currentUser?.userID !== this.expectedUserID) {
      throw new Error(
        "Authenticated account changed during Orbit Sync request",
      );
    }
  }
}

function isResolveResponse(value: unknown): value is ResolveHostedRootResponse {
  return (
    isRecord(value) &&
    boundedOpaqueID(value.accountID) &&
    isAutomergeURL(value.rootDocumentURL) &&
    hasOnlyKeys(value, ["accountID", "rootDocumentURL"])
  );
}

export function hostedSyncWebSocketURL(serviceOrigin: string) {
  const url = new URL(serviceOrigin);
  if (
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    !["https:", "http:"].includes(url.protocol)
  ) {
    throw new Error("Orbit Sync service origin must be an HTTP(S) origin");
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/v1/sync";
  return url.toString();
}

function isControlError(value: unknown): value is HostedControlErrorBody {
  return (
    isRecord(value) &&
    typeof value.error === "string" &&
    hostedControlErrorCodes.has(value.error) &&
    hasOnlyKeys(value, ["error"])
  );
}

const hostedControlErrorCodes = new Set([
  "authentication-required",
  "account-not-provisioned",
  "legacy-account",
  "root-not-bound",
  "invalid-request",
  "rate-limited",
  "service-unavailable",
]);

function boundedOpaqueID(value: unknown) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[\x21-\x7e]+$/.test(value)
  );
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isAutomergeURL(value: unknown) {
  return typeof value === "string" && value.startsWith("automerge:");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
