import type { firestore as ClientFirestore } from "firebase";
import type { firestore as AdminFirestore } from "firebase-admin";

export type Database = ClientFirestore.Firestore | AdminFirestore.Firestore;
export type FieldValue = ClientFirestore.FieldValue | AdminFirestore.FieldValue;
export type CollectionReference<
  D extends Database,
  T
> = D extends ClientFirestore.Firestore
  ? ClientFirestore.CollectionReference<T>
  : AdminFirestore.CollectionReference<T>;
export type TimestampOf<
  D extends Database
> = D extends ClientFirestore.Firestore
  ? ClientFirestore.Timestamp
  : AdminFirestore.Timestamp;

export type DocumentReference<
  D extends Database,
  T
> = D extends ClientFirestore.Firestore
  ? ClientFirestore.DocumentReference<T>
  : AdminFirestore.DocumentReference<T>;

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

// Causes loss of precision.
export function serverTimestampToTimestampMillis<T extends ServerTimestamp>(
  timestamp: T,
): number {
  return timestamp.seconds * 1000;
}

export function maxServerTimestamp(
  a: ServerTimestamp,
  b: ServerTimestamp | null,
): ServerTimestamp;
export function maxServerTimestamp(
  a: ServerTimestamp | null,
  b: ServerTimestamp,
): ServerTimestamp;
export function maxServerTimestamp(a: null, b: null): null;
export function maxServerTimestamp(
  a: ServerTimestamp | null,
  b: ServerTimestamp | null,
): ServerTimestamp | null;
export function maxServerTimestamp(
  a: ServerTimestamp | null,
  b: ServerTimestamp | null,
): ServerTimestamp | null {
  if (a !== null && b !== null) {
    return compareServerTimestamps(a, b) < 0 ? b : a;
  } else if (a === null && b) {
    return b;
  } else if (a && b === null) {
    return a;
  } else {
    return null;
  }
}
