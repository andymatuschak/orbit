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
