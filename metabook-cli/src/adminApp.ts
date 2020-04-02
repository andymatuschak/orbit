import admin from "firebase-admin";
import serviceAccount from "./adminKey.json";

export function getAdminApp() {
  return admin.initializeApp({
    // Seems like the cert initializer has the wrong argument type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    credential: admin.credential.cert(serviceAccount as any),
    databaseURL: "https://metabook-system.firebaseio.com",
  });
}
