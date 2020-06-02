export interface UserRecord {
  userID: string; // an opaque unique identifier
  displayName: string | null;
  emailAddress: string | null;
}

export interface AuthenticationClient {
  subscribeToUserAuthState(
    callback: (userRecord: UserRecord | null) => void,
  ): () => void;

  signInWithEmailAndPassword(email: string, password: string): Promise<unknown>;

  createUserWithEmailAndPassword(
    email: string,
    password: string,
  ): Promise<unknown>;

  userExistsWithEmail(email: string): Promise<boolean>;
}
