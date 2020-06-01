import type { firestore as ClientFirestore } from "firebase";
import type { firestore as AdminFirestore } from "firebase-admin";

export type Database = ClientFirestore.Firestore | AdminFirestore.Firestore;
export type CollectionReference<D extends Database> = ReturnType<
  D["collection"]
>;
export type DocumentReference<D extends Database> = ReturnType<
  CollectionReference<D>["doc"]
>;

export interface ServerTimestamp {
  seconds: number;
  nanoseconds: number;
}

// Returns a negative value if a < b; positive if b > a; 0 if a = b.
export function compareServerTimestamps(
  a: ServerTimestamp,
  b: ServerTimestamp,
): number {
  if (a.seconds === b.seconds) {
    return a.nanoseconds - b.nanoseconds;
  } else {
    return a.seconds - b.seconds;
  }
}

export function maxServerTimestamp(
  a: ServerTimestamp,
  b: ServerTimestamp,
): ServerTimestamp {
  return compareServerTimestamps(a, b) < 0 ? b : a;
}
