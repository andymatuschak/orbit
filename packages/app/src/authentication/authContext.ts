import React, { useEffect, useState } from "react";
import type {
  AuthenticationClient,
  FirebaseOpaqueIDToken,
  FirebaseOpaqueLoginToken,
  UserRecord,
} from "./index.js";

type AppAuthenticationClient = AuthenticationClient<
  FirebaseOpaqueLoginToken,
  FirebaseOpaqueIDToken
>;

export const AuthenticationClientContext =
  React.createContext<AppAuthenticationClient | null>(null);

export function useAuthenticationClient(): AppAuthenticationClient {
  const client = React.useContext(AuthenticationClientContext);
  if (!client) {
    throw new Error(
      "Authentication client context unavailable -- this should never happen",
    );
  }
  return client;
}

// undefined means we don't know yet; null means signed out.
export function useCurrentUserRecord(
  authenticationClient: AuthenticationClient,
): UserRecord | null | undefined {
  const [userRecord, setUserRecord] = useState<UserRecord | null | undefined>(
    undefined,
  );
  useEffect(() => {
    return authenticationClient.subscribeToUserAuthState(setUserRecord);
  }, [authenticationClient]);
  return userRecord;
}
