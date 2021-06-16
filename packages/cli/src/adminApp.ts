import admin from "firebase-admin";
import serviceAccount from "./adminKey.json";

const useEmulator = false;

let _adminApp: admin.app.App;
export function getAdminApp() {
  if (!_adminApp) {
    if (useEmulator) {
      process.env["FIREBASE_AUTH_EMULATOR_HOST"] = "localhost:9099";
      process.env["FIRESTORE_EMULATOR_HOST"] = "localhost:8080";
    }
    _adminApp = admin.initializeApp({
      // Seems like the cert initializer has the wrong argument type.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      credential: admin.credential.cert(serviceAccount as any),
      databaseURL: "https://metabook-system.firebaseio.com",
    });
  }
  return _adminApp;
}
