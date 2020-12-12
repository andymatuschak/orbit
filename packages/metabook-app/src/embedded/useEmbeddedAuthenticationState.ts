import * as Authentication from "../authentication";
import React from "react";
import { getLoginTokenBroadcastChannel } from "../authentication/loginTokenBroadcastChannel";
import useByrefCallback from "../util/useByrefCallback";

declare global {
  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
}

async function attemptLoginWithSessionCookie(
  authenticationClient: Authentication.AuthenticationClient,
) {
  try {
    console.log("Attempting login with session cookie");
    const loginToken = await authenticationClient.getLoginTokenUsingSessionCookie();
    await authenticationClient.signInWithLoginToken(loginToken);
  } catch (error) {
    console.log("Failed login with session cookie", error);
  }
}

async function attemptRefreshSessionCookie(
  authenticationClient: Authentication.AuthenticationClient,
) {
  try {
    const idToken = await authenticationClient.getCurrentIDToken();
    await authenticationClient.refreshSessionCookie(idToken);
  } catch (error) {
    console.error("Couldn't refresh session cookie", error);
  }
}

export type EmbeddedAuthenticationState =
  | {
      status: "pending" | "signedOut";
      userRecord: null;
    }
  | {
      status: "storageRestricted";
      userRecord: null;
      onRequestStorageAccess: () => unknown;
    }
  | { status: "signedIn"; userRecord: Authentication.UserRecord };

// Watch for auth tokens broadcasted from the login popup.
function useLoginTokenSubscription(
  authenticationClient: Authentication.AuthenticationClient,
) {
  // We relay login tokens from the popup to our sibling iframes via a broadcast channel if supported.
  const channel = getLoginTokenBroadcastChannel();
  const onLoginToken = React.useCallback(
    (event: MessageEvent) => {
      if (event.origin === window.origin && event.data.loginToken) {
        console.debug(
          "Received login token from login window",
          event.data,
          event.target,
          event.origin,
        );
        const { loginToken } = event.data;

        authenticationClient.signInWithLoginToken(loginToken).catch((error) => {
          console.error(`Couldn't login with provided token: ${error}`);
        });
      }
    },
    [authenticationClient],
  );
  if (channel) {
    channel.onmessage = onLoginToken;
  }

  React.useEffect(() => {
    return () => {
      channel?.close();
    };
  }, [channel]);
}

export function useEmbeddedAuthenticationState(
  authenticationClient: Authentication.AuthenticationClient,
): EmbeddedAuthenticationState {
  useLoginTokenSubscription(authenticationClient);

  const [authenticationState, setAuthenticationState] = React.useState<
    EmbeddedAuthenticationState
  >({ status: "pending", userRecord: null });

  const [hasStorageAccess, setHasStorageAccess] = React.useState<
    boolean | null
  >(null);

  // Check to see if we have storage access...
  React.useEffect(() => {
    let isInvalidated = false;
    if (typeof document.hasStorageAccess === "function") {
      document.hasStorageAccess().then((hasStorageAccess) => {
        if (isInvalidated) {
          return;
        }
        setHasStorageAccess(hasStorageAccess);
      });
    } else {
      setHasStorageAccess(true);
    }
    return () => {
      isInvalidated = true;
    };
  }, []);

  // Once we know if we have storage access...
  React.useEffect(() => {
    if (authenticationState.status === "pending" && hasStorageAccess !== null) {
      if (hasStorageAccess) {
        authenticationClient
          .supportsCredentialPersistence()
          .then((supportsPersistence) => {
            if (!supportsPersistence) {
              attemptLoginWithSessionCookie(authenticationClient);
            }
          });
      } else {
        setAuthenticationState({
          status: "storageRestricted",
          userRecord: null,
          onRequestStorageAccess: () => {
            document
              .requestStorageAccess()
              .then(() => {
                console.log("Received storage access from user");
                setHasStorageAccess(true);
                setAuthenticationState((authenticationState) =>
                  authenticationState.status === "storageRestricted"
                    ? { status: "pending", userRecord: null }
                    : authenticationState,
                );
              })
              .catch(() => {
                console.error("Storage access declined");
              });
          },
        });
      }
    }
  }, [authenticationState, hasStorageAccess, authenticationClient]);

  const onAuthStateChange = useByrefCallback(
    (userRecord: Authentication.UserRecord | null) => {
      if (userRecord) {
        setAuthenticationState({ status: "signedIn", userRecord });
        authenticationClient
          .supportsCredentialPersistence()
          .then((supportsPersistence) => {
            if (!supportsPersistence) {
              // TODO: avoid doing this upon receiving loginToken from popup
              attemptRefreshSessionCookie(authenticationClient);
            }
          });
      } else if (!userRecord && hasStorageAccess) {
        setAuthenticationState({ status: "signedOut", userRecord: null });
      }
    },
  );

  // Subscribe to user auth state.
  React.useEffect(() => {
    return authenticationClient.subscribeToUserAuthState(onAuthStateChange);
  }, [authenticationClient, onAuthStateChange]);

  return authenticationState;
}
