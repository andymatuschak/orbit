import * as Authentication from "../authentication/index.js";
import React from "react";
import { createLoginTokenBroadcastChannel } from "../authentication/loginTokenBroadcastChannel.js";
import useByrefCallback from "../util/useByrefCallback.js";

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
    const loginToken =
      await authenticationClient.getLoginTokenUsingSessionCookie();
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
export type EmbeddedAuthenticationStatus =
  EmbeddedAuthenticationState["status"];

// Watch for auth tokens broadcasted from the login popup or from peer iframes. These may come either via postMessage() to window.opener or via BroadcastChannel in supported browsers (either from the popup window or from a peer iframe).
function useLoginTokenSubscription(
  authenticationClient: Authentication.AuthenticationClient,
) {
  const channelRef = React.useRef(createLoginTokenBroadcastChannel());

  React.useEffect(() => {
    const channel = channelRef.current;
    function onLoginToken(event: MessageEvent) {
      if (
        (event.origin === window.origin ||
          // HACK in support of fall-2022-beta.withorbit.com.
          event.origin.endsWith(".withorbit.com")) &&
        event.data.loginToken
      ) {
        console.debug(
          "Received broadcasted login token",
          event.data,
          event.target,
          event.origin,
        );
        const { loginToken } = event.data;

        // If this token arrived via postMessage(), we relay login tokens from the popup to our sibling iframes via a broadcast channel if supported.
        if (channel && !(event.target instanceof BroadcastChannel)) {
          channel.postMessage(event.data);
        }

        authenticationClient.signInWithLoginToken(loginToken).catch((error) => {
          console.error(`Couldn't login with provided token: ${error}`);
        });
      }
    }

    if (channel) {
      channel.onmessage = onLoginToken;
    }
    window.addEventListener("message", onLoginToken, false);
    return () => {
      window.removeEventListener("message", onLoginToken);
    };
  }, [authenticationClient]);

  React.useEffect(() => {
    const channel = channelRef.current;
    return () => {
      channel?.close();
    };
  }, []);
}

export function useEmbeddedAuthenticationState(
  authenticationClient: Authentication.AuthenticationClient,
): EmbeddedAuthenticationState {
  useLoginTokenSubscription(authenticationClient);

  const [authenticationState, setAuthenticationState] =
    React.useState<EmbeddedAuthenticationState>({
      status: "pending",
      userRecord: null,
    });

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
