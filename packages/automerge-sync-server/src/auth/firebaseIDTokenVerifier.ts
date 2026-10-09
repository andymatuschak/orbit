import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";

export interface VerifiedFirebasePrincipal {
  subject: string;
  issuer: string;
  expiresAtTimestampMillis: number;
}

export interface FirebaseIDTokenVerifier {
  verifyIDToken(token: string): Promise<VerifiedFirebasePrincipal>;
}

export function parseFirebaseIDAuthorization(value: string | undefined) {
  const match = value?.match(/^ID ([^\s]+)$/);
  if (!match) throw new TypeError("Invalid Firebase ID authorization");
  return match[1];
}

export class FirebaseAdminIDTokenVerifier implements FirebaseIDTokenVerifier {
  constructor(private readonly auth: Auth = getAuth()) {}

  async verifyIDToken(token: string) {
    // checkRevoked=true checks disabled users and tokens revoked through
    // Firebase's tokensValidAfterTime boundary.
    const decoded = await this.auth.verifyIdToken(token, true);
    return decodePrincipal(decoded);
  }
}

function decodePrincipal(token: DecodedIdToken): VerifiedFirebasePrincipal {
  if (!token.uid || !token.iss || !token.exp) {
    throw new Error("Firebase ID token is missing required claims");
  }
  return {
    subject: token.uid,
    issuer: token.iss,
    expiresAtTimestampMillis: token.exp * 1_000,
  };
}
