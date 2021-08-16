import admin from "firebase-admin";

export type WithFirebaseFields<T> = {
  [K in keyof T]:
  | T[K]
  | (T[K] extends Record<string, unknown>
  ? WithFirebaseFields<T[K]>
  : admin.firestore.FieldValue);
};
