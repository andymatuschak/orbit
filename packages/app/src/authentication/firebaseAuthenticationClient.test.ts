import { expect, mock, test } from "bun:test";
import type { Auth } from "firebase/auth";

mock.module("react-native", () => ({ Platform: { OS: "ios" } }));
test("identity and credential reads wait for saved Firebase auth restoration, not a transient null", async () => {
  const { default: FirebaseAuthenticationClient } =
    await import("./firebaseAuthenticationClient.js");
  let finishRestoration!: () => void;
  const restored = new Promise<void>((resolve) => {
    finishRestoration = resolve;
  });
  const auth = {
    currentUser: null as null | {
      uid: string;
      email: string;
      getIdToken(forceRefresh: boolean): Promise<string>;
    },
    authStateReady: () => restored,
  };
  const client = new FirebaseAuthenticationClient(auth as unknown as Auth);
  let identityFinished = false;
  let credentialFinished = false;
  const identity = client.getUserAuthState().then((value) => {
    identityFinished = true;
    return value;
  });
  const credential = client.getCurrentIDToken().then((value) => {
    credentialFinished = true;
    return String(value);
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(identityFinished).toBe(false);
  expect(credentialFinished).toBe(false);
  auth.currentUser = {
    uid: "saved-user",
    email: "saved@example.test",
    getIdToken: async (forceRefresh) => {
      expect(forceRefresh).toBe(true);
      return "fresh-token";
    },
  };
  finishRestoration();
  expect(await identity).toEqual({
    userID: "saved-user",
    emailAddress: "saved@example.test",
  });
  expect(await credential).toBe("fresh-token");
  auth.currentUser = null;
  expect(await client.getUserAuthState()).toBeNull();
  await expect(client.getCurrentIDToken()).rejects.toThrow("Not signed in");
});
