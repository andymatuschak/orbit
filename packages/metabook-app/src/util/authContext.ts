import { Authentication } from "metabook-client";
import React, { useEffect, useState } from "react";

export const AuthenticationClientContext = React.createContext<Authentication.AuthenticationClient | null>(
  null,
);

export function useAuthenticationClient(): Authentication.AuthenticationClient {
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
  authenticationClient: Authentication.AuthenticationClient,
): Authentication.UserRecord | null | undefined {
  const [userRecord, setUserRecord] = useState<
    Authentication.UserRecord | null | undefined
  >(undefined);
  useEffect(() => {
    return authenticationClient.subscribeToUserAuthState(setUserRecord);
  }, [authenticationClient]);
  return userRecord;
}
