import firebase from "firebase-admin";
import { getApp } from "../firebase";

let _database: firebase.firestore.Firestore | null = null;

export function getDatabase(): firebase.firestore.Firestore {
  if (!_database) {
    _database = getApp().firestore();
  }
  return _database;
}
