import firestore from "@react-native-firebase/firestore";
import firebaseFunctions from "@react-native-firebase/functions";
import firebaseAuth from "@react-native-firebase/auth";
import type firebase from "firebase/app";

/*let app: firebase.app.App | null = null;
export function getFirebaseApp(): firebase.app.App {
  if (!app) {
    app = firebase.initializeApp({
      apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
      authDomain: "metabook-system.firebaseapp.com",
      databaseURL: "https://metabook-system.firebaseio.com",
      projectId: "metabook-system",
      storageBucket: "metabook-system.appspot.com",
      messagingSenderId: "748053153064",
      appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
    });

    // console.log("cache directory", FileSystem.cacheDirectory);
    shimFirebasePersistence("");
  }
  return app;
}*/

export function getFirestore(): firebase.firestore.Firestore {
  return (firestore() as unknown) as firebase.firestore.Firestore;
}

export function getFirebaseFunctions(): firebase.functions.Functions {
  return (firebaseFunctions() as unknown) as firebase.functions.Functions;
}

export function getFirebaseAuth(): firebase.auth.Auth {
  return (firebaseAuth() as unknown) as firebase.auth.Auth;
}

export type PersistenceStatus = "pending" | "enabled" | "unavailable";
const persistenceStatus: PersistenceStatus = "pending";
// TODO rename and rationalize this nonsense
export async function enableFirebasePersistence(): Promise<PersistenceStatus> {
  await firestore().settings({
    persistence: false, // disable offline persistence
  } as any);
  return "enabled";
}
