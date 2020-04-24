import { firestore as ClientFirestore } from "firebase";
import { firestore as AdminFirestore } from "firebase-admin";

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
