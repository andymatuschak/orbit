// @ts-ignore https://github.com/firebase/firebase-js-sdk/issues/7584
import { getReactNativePersistence } from "@firebase/auth/dist/rn/index.js";
import { Auth, connectAuthEmulator, initializeAuth } from "firebase/auth";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import serviceConfig from "../../serviceConfig.js";
import { getDefaultFirebaseApp } from "./firebase.js";

let _auth: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = initializeAuth(getDefaultFirebaseApp(), {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
    if (__DEV__ && serviceConfig.shouldUseLocalBackend) {
      connectAuthEmulator(_auth, "http://localhost:9099/");
    }
  }
  return _auth;
}
