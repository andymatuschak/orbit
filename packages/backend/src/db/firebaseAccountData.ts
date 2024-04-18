import firebase from "firebase-admin";
import { getAuth } from "./firebaseAuth.js";
import { getDatabase } from "./firestore.js";

import { UserMetadata } from "./userMetadata.js";

function getUserMetadataReference(
  database: firebase.firestore.Firestore,
  userID: string,
): firebase.firestore.DocumentReference<UserMetadata> {
  return database.doc(
    `users/${userID}`,
  ) as firebase.firestore.DocumentReference<UserMetadata>;
}

export async function getUserMetadata(
  userID: string,
  database: firebase.firestore.Firestore = getDatabase(),
): Promise<UserMetadata | null> {
  const snapshot = await getUserMetadataReference(database, userID).get();
  return snapshot.data() ?? null;
}

export async function getUserEmail(userID: string): Promise<string | null> {
  const userRecord = await getAuth()
    .getUser(userID)
    .catch(() => null);
  return userRecord?.email ?? null;
}

export async function updateUserMetadata(
  userID: string,
  userRecordUpdate: Partial<UserMetadata>,
): Promise<void> {
  const ref = getUserMetadataReference(getDatabase(), userID);
  await ref.set(userRecordUpdate, { merge: true });
}

export interface UserEnumerationRecord {
  userID: string;
  email: string;
  userMetadata: UserMetadata;
}

export async function enumerateUsers(
  visitor: (record: UserEnumerationRecord) => Promise<unknown>,
): Promise<void> {
  let pageToken: string | undefined = undefined;
  const db = getDatabase();
  do {
    const listUsersResult = await getAuth().listUsers(1000, pageToken);

    const userMetadataRefs = listUsersResult.users.map((userRecord) =>
      getUserMetadataReference(db, userRecord.uid),
    );
    const snapshots = await db.getAll(...userMetadataRefs);
    for (let i = 0; i < listUsersResult.users.length; i++) {
      const userRecord = listUsersResult.users[i];
      if (!userRecord.email) {
        throw new Error(
          `Invariant violation: user ${userRecord.uid} has no email`,
        );
      }

      const userMetadata = snapshots[i].data() as UserMetadata;
      if (!userMetadata) {
        throw new Error(
          `Invariant violation: user ${userRecord.uid} has no metadata record`,
        );
      }

      await visitor({
        userID: userRecord.uid,
        email: userRecord.email,
        userMetadata,
      });
    }
    pageToken = listUsersResult.pageToken;
  } while (pageToken);
}
