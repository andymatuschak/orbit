import OrbitAPIClient from "@withorbit/api-client";
import React from "react";
import serviceConfig from "../../serviceConfig.js";
import { AuthenticationClient } from "../authentication/index.js";

export function useAPIClient(
  authenticationClient: AuthenticationClient,
): OrbitAPIClient {
  return React.useMemo(
    () =>
      new OrbitAPIClient(
        async () => ({
          idToken: (await authenticationClient.getCurrentIDToken()) as string,
        }),
        { baseURL: serviceConfig.httpsAPIBaseURLString },
      ),
    [authenticationClient],
  );
}
