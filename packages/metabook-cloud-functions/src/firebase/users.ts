import admin from "firebase-admin";

import {
  getUserMetadataReference,
  UserMetadata,
} from "metabook-firebase-support";
import { getDatabase } from "./firebase";

export async function updateUserMetadata(
  userID: string,
  userRecordUpdate: Partial<UserMetadata<admin.firestore.Timestamp>>,
): Promise<void> {
  const ref = getUserMetadataReference(getDatabase(), userID);
  await ref.set(userRecordUpdate, { merge: true });
}

/*

interface UserRecord {
  email: string;
  registration;
}

export async function listUsers(pageToken?: string) {
  const listUsersResult = await firebase.auth().listUsers(1000, pageToken);
  listUsersResult.users.forEach(function (userRecord) {
    console.log("user", userRecord.toJSON());
  });
  return listUsersResult.pageToken;
}

 */
