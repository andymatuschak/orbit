import * as dateFns from "date-fns";
import * as firebase from "firebase-admin";
import { getApp, getDatabase } from "./firebase";

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

interface AccessCodeRecord {
  userID: string;
  expirationTimestamp: firebase.firestore.Timestamp;
}

function getAccessCodeCollection(): firebase.firestore.CollectionReference<
  AccessCodeRecord
> {
  const db = getDatabase();
  return db.collection("accessCodes") as firebase.firestore.CollectionReference<
    AccessCodeRecord
  >;
}

// Creates an access code which can be used once to sign in.
export async function createOneTimeAccessCode(
  userID: string,
  nowTimestampMillis = Date.now(),
  daysValid = 14,
) {
  const accessCodeDoc = getAccessCodeCollection().doc();
  await accessCodeDoc.set({
    userID,
    expirationTimestamp: firebase.firestore.Timestamp.fromDate(
      dateFns.addDays(nowTimestampMillis, daysValid),
    ),
  });

  return accessCodeDoc.id;
}

// Consumes an access code. If it's valid, returns a Firebase custom auth token which can be used to login for one hour.
export async function exchangeAccessCodeForCustomLoginToken(
  accessCode: string,
  nowTimestampMillis = Date.now(),
): Promise<string> {
  return getDatabase().runTransaction(async (transaction) => {
    const documentRef = getAccessCodeCollection().doc(accessCode);
    const snapshot = await transaction.get(documentRef);

    if (snapshot.exists) {
      const record = snapshot.data()!;
      if (record.expirationTimestamp.toMillis() > nowTimestampMillis) {
        const customToken = await getAuth().createCustomToken(record.userID);
        await transaction.delete(documentRef);
        return customToken;
      } else {
        throw new Error("Access code has expired");
      }
    } else {
      throw new Error(
        "Access code does not exist or has already been consumed",
      );
    }
  });
}
