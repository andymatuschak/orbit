import type { HostedVaultAccountRecord } from "@withorbit/api";
import type {
  FirebaseIDTokenVerifier,
  VerifiedFirebasePrincipal,
} from "../auth/firebaseIDTokenVerifier.js";

export const testNowTimestampMillis = 1_800_000_000_000;

export function hostedAccount(
  overrides: Partial<HostedVaultAccountRecord> = {},
): HostedVaultAccountRecord {
  return {
    schemaVersion: 1,
    authIssuer: "https://securetoken.google.com/orbit-test",
    authSubject: "user-a",
    emailAddress: "user-a@example.test",
    registrationTimestampMillis: testNowTimestampMillis - 86_400_000,
    hostedVaultID: "account-a",
    root: { status: "unbound" },
    migration: {
      mode: "automerge",
      source: "new-account",
      cutoverAtTimestampMillis: testNowTimestampMillis - 1_000,
      rollbackUntilTimestampMillis: null,
      legacyArchiveKey: null,
    },
    notificationMode: "pending",
    ...overrides,
  };
}

export function verifiedPrincipal(
  overrides: Partial<VerifiedFirebasePrincipal> = {},
): VerifiedFirebasePrincipal {
  return {
    subject: "user-a",
    issuer: "https://securetoken.google.com/orbit-test",
    expiresAtTimestampMillis: testNowTimestampMillis + 60 * 60_000,
    ...overrides,
  };
}

export class TestFirebaseIDTokenVerifier implements FirebaseIDTokenVerifier {
  readonly revokedSubjects = new Set<string>();

  constructor(
    private readonly principals: Readonly<
      Record<string, VerifiedFirebasePrincipal>
    > = { valid: verifiedPrincipal() },
  ) {}

  async verifyIDToken(token: string) {
    const principal = this.principals[token];
    if (!principal || this.revokedSubjects.has(principal.subject)) {
      throw new Error("Invalid test identity");
    }
    return structuredClone(principal);
  }
}
