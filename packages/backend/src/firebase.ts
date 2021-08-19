import firebase from "firebase-admin";

let _app: firebase.app.App | null = null;
export function getApp(): firebase.app.App {
  if (!_app) {
    _app = firebase.initializeApp();
  }
  return _app;
}
