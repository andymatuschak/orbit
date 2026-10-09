import type { AutomergeDocumentURL } from "@withorbit/core";

export interface HostedSyncCredential {
  kind: "firebaseIDToken";
  token: string;
}

export interface ResolveHostedRootResponse {
  accountID: string;
  rootDocumentURL: AutomergeDocumentURL;
}

export interface HostedVaultControlClient {
  resolveHostedRoot(
    credential: HostedSyncCredential,
  ): Promise<ResolveHostedRootResponse>;
}

export interface HostedSyncAdmissionFrame {
  type: "orbit-sync-admission";
  protocolVersion: 1;
  firebaseIDToken: string;
}

export interface HostedSyncAdmissionAcceptedFrame {
  type: "orbit-sync-admission-accepted";
  protocolVersion: 1;
}

export interface HostedControlErrorBody {
  error:
    | "authentication-required"
    | "account-not-provisioned"
    | "legacy-account"
    | "root-not-bound"
    | "invalid-request"
    | "body-too-large"
    | "rate-limited"
    | "service-unavailable";
}
