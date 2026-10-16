import type { AutomergeDocumentURL } from "@withorbit/core";

// Repo messages can include a complete catalog or attachment. Keep a finite
// budget, shared with the native URLSession dependency patch.
export const automergeSyncMaximumMessageBytes = 16 * 1024 * 1024;

export interface HostedSyncCredential {
  kind: "pairedToken";
  token: string;
}

export interface LabVaultRoot {
  rootDocumentURL: AutomergeDocumentURL;
}

export interface HostedSyncAdmissionFrame {
  type: "orbit-sync-admission";
  protocolVersion: 1;
  token: string;
}

export interface HostedSyncAdmissionAcceptedFrame {
  type: "orbit-sync-admission-accepted";
  protocolVersion: 1;
}

export interface HostedControlErrorBody {
  error:
    | "authentication-required"
    | "invalid-request"
    | "body-too-large"
    | "service-unavailable";
}
