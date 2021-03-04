import firestore, {
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";
import firebaseFunctions from "@react-native-firebase/functions";
import firebaseAuth from "@react-native-firebase/auth";
import type firebase from "firebase/app";

export function getFirestore(): firebase.firestore.Firestore {
  return (firestore() as unknown) as firebase.firestore.Firestore;
}

export function getFirebaseFunctions(): firebase.functions.Functions {
  return (firebaseFunctions() as unknown) as firebase.functions.Functions;
}

export function getFirebaseAuth(): firebase.auth.Auth {
  return (firebaseAuth() as unknown) as firebase.auth.Auth;
}
