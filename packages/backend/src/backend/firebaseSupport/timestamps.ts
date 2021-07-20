import firebase from "firebase-admin";

type Timestamp = firebase.firestore.Timestamp;

// Causes loss of precision.
export function serverTimestampToTimestampMillis(timestamp: Timestamp): number {
  return timestamp.seconds * 1000;
}

export function maxServerTimestamp(
  a: Timestamp,
  b: Timestamp | null,
): Timestamp;
export function maxServerTimestamp(
  a: Timestamp | null,
  b: Timestamp,
): Timestamp;
export function maxServerTimestamp(a: null, b: null): null;
export function maxServerTimestamp(
  a: Timestamp | null,
  b: Timestamp | null,
): Timestamp | null;
export function maxServerTimestamp(
  a: Timestamp | null,
  b: Timestamp | null,
): Timestamp | null {
  if (a !== null && b !== null) {
    return a.valueOf() < b.valueOf() ? b : a;
  } else if (a === null && b) {
    return b;
  } else if (a && b === null) {
    return a;
  } else {
    return null;
  }
}
