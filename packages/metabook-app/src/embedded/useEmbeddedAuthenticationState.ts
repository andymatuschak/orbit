import * as Authentication from "../authentication";
import React from "react";
import useByrefCallback from "../util/useByrefCallback";

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

// Watch for messages from the login popup.
function useSignInTokenSubscription(
  authenticationClient: Authentication.AuthenticationClient,
) {
  const onMessage = React.useCallback(
    (event: MessageEvent) => {
      if (event.origin === window.origin && event.data.loginToken) {
        const { loginToken } = event.data;
        console.debug("Received login token from other window", event.data);
        authenticationClient.signInWithLoginToken(loginToken).catch((error) => {
          console.error(`Couldn't login with provided token: ${error}`);
        });
      }
    },
    [authenticationClient],
  );

  React.useEffect(() => {
    window.addEventListener("message", onMessage, false);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [onMessage]);
}

export function useEmbeddedAuthenticationState(
  authenticationClient: Authentication.AuthenticationClient,
): EmbeddedAuthenticationState {
  useSignInTokenSubscription(authenticationClient);

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
      console.log("Has storage access", hasStorageAccess);
      if (hasStorageAccess) {
        if (!authenticationClient.supportsCredentialPersistence()) {
          attemptLoginWithSessionCookie(authenticationClient);
        }
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
                // TODO: now what? make sure this still works locally...
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
        if (!authenticationClient.supportsCredentialPersistence()) {
          // TODO: avoid doing this upon receiving loginToken from popup
          attemptRefreshSessionCookie(authenticationClient);
        }
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
