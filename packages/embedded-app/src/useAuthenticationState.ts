import { Authentication } from "metabook-client";
import React from "react";

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

export type AuthenticationState =
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

export function useAuthenticationState(
  authenticationClient: Authentication.AuthenticationClient,
): AuthenticationState {
  const [authenticationState, setAuthenticationState] = React.useState<
    AuthenticationState
  >({ status: "pending", userRecord: null });
  const [
    readyToSubscribeToUserAuth,
    setReadyToSubscribeToUserAuth,
  ] = React.useState(false);

  const [hasStorageAccess, setHasStorageAccess] = React.useState<
    boolean | null
  >(null);

  // Check to see if we have storage access...
  const isInvalidated = React.useRef(false);
  React.useEffect(() => {
    if (typeof document.hasStorageAccess === "function") {
      document.hasStorageAccess().then((hasStorageAccess) => {
        if (isInvalidated.current) {
          return;
        }
        setHasStorageAccess(hasStorageAccess);
      });
    } else {
      setHasStorageAccess(true);
    }
    return () => {
      isInvalidated.current = true;
    };
  }, []);

  // Once we know if we have storage access...
  React.useEffect(() => {
    if (authenticationState.status === "pending" && hasStorageAccess !== null) {
      console.log("Has storage access", hasStorageAccess);
      if (hasStorageAccess) {
        setReadyToSubscribeToUserAuth(true);
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
                console.log("RECEIVED STORAGE ACCESS");
                document.hasStorageAccess().then((hasAccess) => {
                  console.log("post grant hasStorageAccess", hasAccess);
                });
                setHasStorageAccess(true);
                setAuthenticationState((authenticationState) =>
                  authenticationState.status === "storageRestricted"
                    ? { status: "pending", userRecord: null }
                    : authenticationState,
                );
              })
              .catch(() => {
                console.error("NO STORAGE ACCESS");
              });
          },
        });
      }
    }
  }, [authenticationState, hasStorageAccess, authenticationClient]);

  // Once we're ready to subscribe to user auth...
  React.useEffect(() => {
    // TODO wait until ready to subscribe... or not, since Safari seems to be lying about whether we have storage access
    return authenticationClient.subscribeToUserAuthState(async (userRecord) => {
      if (userRecord) {
        setAuthenticationState({ status: "signedIn", userRecord });
        if (!authenticationClient.supportsCredentialPersistence()) {
          // TODO: avoid doing this upon receiving loginToken from popup
          attemptRefreshSessionCookie(authenticationClient);
        }
      } else if (!userRecord && hasStorageAccess) {
        setAuthenticationState({ status: "signedOut", userRecord: null });
      }
    });
  }, [readyToSubscribeToUserAuth, authenticationClient]);

  // Watch for messages from the login popup.
  const onMessage = React.useCallback(
    (event: MessageEvent) => {
      if (event.origin === "https://embed.withorbit.com") {
        const loginToken = event.data;
        console.debug("Received login token from other window", event.data);
        setReadyToSubscribeToUserAuth(true);
        authenticationClient.signInWithLoginToken(loginToken).catch((error) => {
          console.error(`Couldn't login with provided token: ${error}`);
        });
      } else {
        console.debug("Discarding cross-origin message", event);
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

  return authenticationState;
}
