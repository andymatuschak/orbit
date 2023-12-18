import { Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import serviceConfig from "../../serviceConfig.js";
import { getDefaultFirebaseApp } from "./firebase.js";

let _auth: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getDefaultFirebaseApp());
    if (__DEV__ && serviceConfig.shouldUseLocalBackend) {
      connectAuthEmulator(_auth, "http://localhost:9099/");
    }
  }
  return _auth;
}
