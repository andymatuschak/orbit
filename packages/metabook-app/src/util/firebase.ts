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

let _auth: firebase.auth.Auth | null = null;
function getAuth() {
  if (_auth === null) {
    _auth = (firebaseAuth() as unknown) as firebase.auth.Auth;
  }
  return _auth;
}

export interface AuthenticationClient {
  subscribeToUserAuthState(
    callback: (userID: string | null) => void,
  ): () => void;

  signInWithEmailAndPassword(email: string, password: string): Promise<unknown>;

  createUserWithEmailAndPassword(
    email: string,
    password: string,
  ): Promise<unknown>;

  userExistsWithEmail(email: string): Promise<boolean>;
}

export const authenticationClient: AuthenticationClient = {
  subscribeToUserAuthState(callback) {
    const auth = getAuth();
    console.log("current uid", auth.currentUser);
    return auth.onAuthStateChanged((newUser) => {
      callback(newUser?.uid ?? null);
    });
  },

  signInWithEmailAndPassword(email, password) {
    return getAuth().signInWithEmailAndPassword(email, password);
  },

  createUserWithEmailAndPassword(email, password) {
    return getAuth().createUserWithEmailAndPassword(email, password);
  },

  async userExistsWithEmail(email) {
    const methods = await getAuth().fetchSignInMethodsForEmail(email);
    return methods.length > 0;
  },
};

export type PersistenceStatus = "pending" | "enabled" | "unavailable";
const persistenceStatus: PersistenceStatus = "pending";
// TODO rename and rationalize this nonsense
export async function enableFirebasePersistence(): Promise<PersistenceStatus> {
  await firestore().settings({
    persistence: false, // disable offline persistence
  } as any);
  return "enabled";
}
