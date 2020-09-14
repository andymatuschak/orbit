import type firebase from "firebase/app";
import { MetabookUnsubscribe } from "metabook-client/dist/types/unsubscribe";
import { AuthenticationClient, UserRecord } from "./authenticationClient";

const httpsAPIBaseURLString = "https://app.withorbit.com/api";

export class FirebaseOpaqueLoginToken {
  _token: string;

  constructor(tokenStringRepresentation: string) {
    this._token = tokenStringRepresentation;
  }

  toString(): string {
    return this._token;
  }
}

export class FirebaseOpaqueIDToken {
  _token: string;

  constructor(tokenStringRepresentation: string) {
    this._token = tokenStringRepresentation;
  }

  toString(): string {
    return this._token;
  }
}

export default class FirebaseAuthenticationClient
  implements
    AuthenticationClient<FirebaseOpaqueLoginToken, FirebaseOpaqueIDToken> {
  private auth: firebase.auth.Auth;

  constructor(auth: firebase.auth.Auth) {
    this.auth = auth;
  }

  subscribeToUserAuthState(
    callback: (userRecord: UserRecord | null) => void,
  ): MetabookUnsubscribe {
    return this.auth.onAuthStateChanged((newUser) => {
      const newUserRecord = newUser
        ? {
            userID: newUser.uid,
            displayName: newUser.displayName,
            emailAddress: newUser.email,
          }
        : null;
      console.log("UID changed:", newUserRecord);
      callback(newUserRecord);
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

  sendPasswordResetEmail(email: string): Promise<void> {
    return this.auth.sendPasswordResetEmail(email);
  }

  async getCurrentIDToken(): Promise<FirebaseOpaqueIDToken> {
    const currentUser = this.auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken(true);
      return new FirebaseOpaqueIDToken(idToken);
    } else {
      throw new Error("Not signed in");
    }
  }

  async getLoginTokenUsingSessionCookie(): Promise<FirebaseOpaqueLoginToken> {
    const fetchResult = await fetch(`${httpsAPIBaseURLString}/getLoginToken`);
    if (fetchResult.ok) {
      const loginToken = await fetchResult.text();
      return new FirebaseOpaqueLoginToken(loginToken);
    } else {
      throw new Error(
        `Sign in failed with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
  }

  async getLoginTokenUsingIDToken(
    idToken: FirebaseOpaqueIDToken,
  ): Promise<FirebaseOpaqueLoginToken> {
    const fetchResult = await fetch(
      `${httpsAPIBaseURLString}/getLoginToken?idToken=${idToken._token}`,
    );
    if (fetchResult.ok) {
      const loginToken = await fetchResult.text();
      return new FirebaseOpaqueLoginToken(loginToken);
    } else {
      throw new Error(
        `Sign in failed with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
  }

  async signInWithLoginToken(
    loginToken: FirebaseOpaqueLoginToken,
  ): Promise<unknown> {
    await this.auth.signInWithCustomToken(loginToken._token);
    return;
  }

  async refreshSessionCookie(idToken: FirebaseOpaqueIDToken): Promise<unknown> {
    const fetchResult = await fetch(
      `${httpsAPIBaseURLString}/refreshSessionCookie?idToken=${idToken._token}`,
    );
    if (!fetchResult.ok) {
      throw new Error(
        `Failed to refresh session cookie with status code ${
          fetchResult.status
        }: ${await fetchResult.text()}`,
      );
    }
    return;
  }

  supportsCredentialPersistence(): boolean {
    try {
      const request = window.indexedDB.open("firebaseLocalStorageDb");
      request.onsuccess = (event) => {
        request.result.close();
      };
      // We don't need to wait for success to return true: when IDB is unsupported, it will fail immediately.
      return true;
    } catch {
      return false;
    }
  }
}
