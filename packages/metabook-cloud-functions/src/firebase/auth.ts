import * as firebase from "firebase-admin";
import { getApp } from "./firebase";

let _auth: firebase.auth.Auth | null = null;

function getAuth(): firebase.auth.Auth {
  if (!_auth) {
    _auth = getApp().auth();
  }
  return _auth;
}

export async function getAuthTokensForIDToken(
  idToken: string,
): Promise<{
  sessionCookie: string;
  sessionCookieExpirationDate: Date;
  customLoginToken: string;
}> {
  const auth = getAuth();
  // At some point, once we add features which would involve revoking user tokens, we'd want to check here to see if the user's token's been revoked.
  const decodedToken = await auth.verifyIdToken(idToken); // will reject on error

  const expiresIn = 1000 * 60 * 60 * 24 * 14; // 2 weeks
  const sessionCookieExpirationDate = new Date(Date.now() + expiresIn);

  const [sessionCookie, customLoginToken] = await Promise.all([
    auth.createSessionCookie(idToken, { expiresIn }),
    auth.createCustomToken(decodedToken.uid),
  ]);
  return { sessionCookie, customLoginToken, sessionCookieExpirationDate };
}

export async function getCustomLoginTokenForSessionCookie(
  sessionCookie: string,
): Promise<string> {
  const auth = getAuth();
  const decodedToken = await auth.verifySessionCookie(sessionCookie); // will reject on error
  return auth.createCustomToken(decodedToken.uid);
}
