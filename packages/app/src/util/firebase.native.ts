import firebaseAuth from "@react-native-firebase/auth";
import firebaseFunctions from "@react-native-firebase/functions";
import type firebase from "firebase/app";
import serviceConfig from "../../serviceConfig";

export function getFirebaseFunctions(): firebase.functions.Functions {
  return (firebaseFunctions() as unknown) as firebase.functions.Functions;
}

export function getFirebaseAuth(): firebase.auth.Auth {
  const auth = firebaseAuth();
  if (serviceConfig.shouldUseLocalBackend) {
    auth.useEmulator("http://localhost:9099");
  }
  return (auth as unknown) as firebase.auth.Auth;
}
