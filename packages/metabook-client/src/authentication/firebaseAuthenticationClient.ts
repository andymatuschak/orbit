import firebase from "firebase";
import "firebase/auth";
import { MetabookUnsubscribe } from "../types/unsubscribe";
import { AuthenticationClient } from "./authenticationClient";

export default class FirebaseAuthenticationClient
  implements AuthenticationClient {
  private auth: firebase.auth.Auth;

  constructor(auth: firebase.auth.Auth) {
    this.auth = auth;
  }

  subscribeToUserAuthState(
    callback: (userID: string | null) => void,
  ): MetabookUnsubscribe {
    return this.auth.onAuthStateChanged((newUser) => {
      console.log("UID changed:", this.auth.currentUser);
      callback(newUser?.uid ?? null);
    });
  }

  signInWithEmailAndPassword(email: string, password: string) {
    return this.auth.signInWithEmailAndPassword(email, password);
  }

  createUserWithEmailAndPassword(email: string, password: string) {
    return this.auth.createUserWithEmailAndPassword(email, password);
  }

  async userExistsWithEmail(email: string) {
    const methods = await this.auth.fetchSignInMethodsForEmail(email);
    return methods.length > 0;
  }
}
