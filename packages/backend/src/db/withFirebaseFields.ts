import { FieldValue } from "firebase-admin/firestore";

export type WithFirebaseFields<T> = {
  [K in keyof T]:
    | T[K]
    | (T[K] extends Record<string, unknown>
        ? WithFirebaseFields<T[K]>
        : FieldValue);
};
