export interface UserRecord {
  userID: string; // an opaque unique identifier
  displayName: string | null;
  emailAddress: string | null;
}

export interface AuthenticationClient<LoginToken = any, IDToken = any> {
  subscribeToUserAuthState(
    callback: (userRecord: UserRecord | null) => void,
  ): () => void;

  signInWithEmailAndPassword(email: string, password: string): Promise<unknown>;

  createUserWithEmailAndPassword(
    email: string,
    password: string,
  ): Promise<unknown>;

  userExistsWithEmail(email: string): Promise<boolean>;
  sendPasswordResetEmail(email: string): Promise<void>;

  getCurrentIDToken(): Promise<IDToken>;

  getLoginTokenUsingSessionCookie(): Promise<LoginToken>;
  getLoginTokenUsingIDToken(IDToken: IDToken): Promise<LoginToken>;
  signInWithLoginToken(loginToken: LoginToken): Promise<unknown>;
  refreshSessionCookie(IDToken: IDToken): Promise<unknown>;

  supportsCredentialPersistence(): boolean;
}
