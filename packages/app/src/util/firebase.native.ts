import firebaseAuth from "@react-native-firebase/auth";
import type firebase from "firebase/app";
import serviceConfig from "../../serviceConfig.js";

export function getFirebaseAuth(): firebase.auth.Auth {
  const auth = firebaseAuth();
  if (serviceConfig.shouldUseLocalBackend) {
    auth.useEmulator("http://localhost:9099");
  }
  return auth as unknown as firebase.auth.Auth;
}
