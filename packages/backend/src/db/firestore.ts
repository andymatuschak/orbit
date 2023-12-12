import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getApp } from "../firebaseApp.js";

let _database: Firestore | null = null;

export function getDatabase(): Firestore {
  if (!_database) {
    _database = getFirestore(getApp());
  }
  return _database;
}
