import { App, initializeApp } from "firebase-admin/app";

let _app: App | null = null;
export function getApp(): App {
  if (!_app) {
    _app = initializeApp();
  }
  return _app;
}
