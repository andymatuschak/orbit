import firebase from "firebase-admin";
import admin from "firebase-admin";

import { UserMetadata } from "./userMetadata";
import { getDatabase } from "../firebase";
import { WithFirebaseFields } from "./withFirebaseFields";

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
): Promise<UserMetadata | null> {
  const snapshot = await getUserMetadataReference(getDatabase(), userID).get();
  return snapshot.data() ?? null;
}

export async function getUserEmail(userID: string): Promise<string | null> {
  const userRecord = await admin
    .auth()
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

export async function clearUserSessionNotificationState(
  userID: string,
): Promise<void> {
  const ref = getUserMetadataReference(getDatabase(), userID);
  // set() has the wrong type annotation: it should accept FieldValues. So we have to do this casting dance.
  await ref.set(
    {
      sessionNotificationState: admin.firestore.FieldValue.delete(),
    } as WithFirebaseFields<Partial<UserMetadata>> as Partial<UserMetadata>,
    { merge: true },
  );
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
    const listUsersResult: admin.auth.ListUsersResult = await admin
      .auth()
      .listUsers(1000, pageToken);

    for (const userRecord of listUsersResult.users) {
      const userMetadataSnapshot = await getUserMetadataReference(
        db,
        userRecord.uid,
      ).get();
      if (!userRecord.email) {
        throw new Error(
          `Invariant violation: user ${userRecord.uid} has no email`,
        );
      }

      const userMetadata = userMetadataSnapshot.data();
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
