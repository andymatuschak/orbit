import * as dateFns from "date-fns";
import firebase from "firebase-admin";
import { getApp } from "../firebase.js";
import { getDatabase } from "./firestore.js";

let _auth: firebase.auth.Auth | null = null;

function getAuth(): firebase.auth.Auth {
  if (!_auth) {
    _auth = getApp().auth();
  }
  return _auth;
}

// Resolves to user ID if valid or throws if invalid.
export async function validateIDToken(idToken: string): Promise<string> {
  // At some point, once we add features which would involve revoking user tokens, we'd want to check here to see if the user's token's been revoked.
  const decodedToken = await getAuth().verifyIdToken(idToken); // will reject on error
  return decodedToken.uid;
}

export async function createSessionCookie(idToken: string): Promise<{
  sessionCookie: string;
  sessionCookieExpirationDate: Date;
}> {
  const auth = getAuth();
  const expiresIn = 1000 * 60 * 60 * 24 * 14; // 2 weeks
  const sessionCookieExpirationDate = new Date(Date.now() + expiresIn);

  const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });
  return { sessionCookie, sessionCookieExpirationDate };
}

// Resolves to user ID if valid or throws if invalid.
export async function validateSessionCookie(
  sessionCookie: string,
): Promise<string> {
  const decodedToken = await getAuth().verifySessionCookie(sessionCookie); // will reject on error
  return decodedToken.uid;
}

export async function createCustomLoginToken(userID: string): Promise<string> {
  return await getAuth().createCustomToken(userID);
}

type OneTimeAccessCodeRecord = {
  type: typeof AccessCodeRecordType.OneTime;
  userID: string;
  expirationTimestamp: firebase.firestore.Timestamp;
};

type PersonalAccessTokenRecord = {
  type: typeof AccessCodeRecordType.PersonalAccessToken;
  userID: string;
};

type AccessCodeRecord = OneTimeAccessCodeRecord | PersonalAccessTokenRecord;

enum AccessCodeRecordType {
  OneTime = "oneTime",
  PersonalAccessToken = "personalAccessToken",
}

function getAccessCodeCollection(): firebase.firestore.CollectionReference<AccessCodeRecord> {
  const db = getDatabase();
  return db.collection(
    "accessCodes",
  ) as firebase.firestore.CollectionReference<AccessCodeRecord>;
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
    type: AccessCodeRecordType.OneTime,
  });

  return accessCodeDoc.id;
}

export async function createPersonalAccessToken(
  userID: string,
): Promise<string> {
  const accessCodeDoc = getAccessCodeCollection().doc();
  await accessCodeDoc.set({
    userID,
    type: AccessCodeRecordType.PersonalAccessToken,
  });

  return accessCodeDoc.id;
}

// Validates access code, consuming it if valid. Resolves to user ID if valid; rejects if invalid.
export async function consumeAccessCode(
  accessCode: string,
  nowTimestampMillis = Date.now(),
): Promise<string> {
  return getDatabase().runTransaction(async (transaction) => {
    const documentRef = getAccessCodeCollection().doc(accessCode);
    const snapshot = await transaction.get(documentRef);

    if (snapshot.exists) {
      const record = snapshot.data()!;
      if (!record.type || record.type === AccessCodeRecordType.OneTime) {
        if (record.expirationTimestamp.toMillis() > nowTimestampMillis) {
          await transaction.delete(documentRef);
          return record.userID;
        } else {
          throw new Error("Access code has expired");
        }
      } else if (record.type === AccessCodeRecordType.PersonalAccessToken) {
        return record.userID;
      } else {
        throw new Error(`Unknown access code type ${record}`);
      }
    } else {
      throw new Error(
        "Access code does not exist or has already been consumed",
      );
    }
  });
}
