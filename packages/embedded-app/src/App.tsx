import {
  Authentication,
  getDefaultFirebaseApp,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  Prompt,
  PromptParameters,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import {
  promptReviewItemType,
  ReviewArea,
  ReviewAreaMarkingRecord,
  ReviewItem,
} from "metabook-ui";
import BigButton from "metabook-ui/dist/components/BigButton";
import colors from "metabook-ui/dist/styles/colors";
import { spacing } from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";

import React from "react";
import { Text, View } from "react-native";

declare global {
  // supplied by Webpack
  const USER_ID: string | null;

  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
}

interface EmbeddedItem {
  prompt: Prompt;
  promptParameters: PromptParameters;
}

const defaultItems: ReviewItem[] = [
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
];

function AuthenticationStatusIndicator(props: {
  authenticationState: AuthenticationState;
  onSignIn: () => void;
}) {
  let interior: React.ReactNode;
  switch (props.authenticationState.status) {
    case "signedIn":
      const userRecord = props.authenticationState.userRecord;
      interior = (
        <Text
          style={{ ...typography.label, color: colors.textColor, opacity: 0.4 }}
        >{`Signed in as ${
          userRecord.displayName ?? userRecord.emailAddress ?? userRecord.userID
        }`}</Text>
      );
      break;

    case "signedOut":
      interior = (
        <BigButton
          title="Sign in"
          onPress={props.onSignIn}
          variant="secondary"
        />
      );
      break;

    case "pending":
      interior = null;
      break;

    case "storageRestricted":
      interior = (
        <BigButton
          title="Connect"
          onPress={props.onSignIn}
          variant="secondary"
        />
      );
      break;
  }

  return (
    <View
      style={{
        position: "absolute",
        left: spacing.spacing07,
        bottom: spacing.spacing07,
      }}
    >
      {interior}
    </View>
  );
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

type AuthenticationState =
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
function useAuthenticationState(
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

function App() {
  const [queue, setQueue] = React.useState<ReviewItem[]>(() => {
    // Try to deserialize PromptTasks from anchor.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const tasksString = params.get("i");
      if (tasksString) {
        const items: EmbeddedItem[] = JSON.parse(tasksString);
        // TODO validate items
        return items.map(
          (item) =>
            ({
              prompt: item.prompt,
              promptParameters: item.promptParameters,
              promptState: null,
              reviewItemType: promptReviewItemType,
              attachmentResolutionMap: null,
            } as ReviewItem),
        );
      }
    }
    return defaultItems;
  });

  const [{ userClient, dataClient, authenticationClient }] = React.useState(
    () => {
      const app = getDefaultFirebaseApp();
      const firestore = app.firestore();
      return {
        userClient: new MetabookFirebaseUserClient(firestore, "demo"),
        dataClient: new MetabookFirebaseDataClient(firestore, app.functions()),
        authenticationClient: new Authentication.FirebaseAuthenticationClient(
          app.auth(),
        ),
      };
    },
  );

  const authenticationState = useAuthenticationState(authenticationClient);

  const onSignIn = React.useCallback(() => {
    window.open(
      `/login${
        authenticationClient.supportsCredentialPersistence()
          ? ""
          : "?shouldSendOpenerLoginToken=true"
      }`,
      "Sign in",
      "width=985,height=735",
    );
  }, [authenticationClient]);

  const onMark = React.useCallback(
    (marking: ReviewAreaMarkingRecord) => {
      console.log("status", authenticationState.status);
      if (authenticationState.status === "storageRestricted") {
        authenticationState.onRequestStorageAccess();
      }
      setQueue((queue) => queue.slice(1));

      if (!USER_ID) {
        return;
      }

      // Ingest prompt for user
      const promptTask = {
        promptType: marking.reviewItem.prompt.promptType,
        promptID: getIDForPrompt(marking.reviewItem.prompt),
        promptParameters: marking.reviewItem.promptParameters,
      } as PromptTask;

      userClient
        .recordActionLogs([
          {
            actionLogType: repetitionActionLogType,
            taskID: getIDForPromptTask(promptTask),
            parentActionLogIDs: [],
            taskParameters: null,
            outcome: marking.outcome,
            context: null,
            timestampMillis: Date.now(),
          },
        ])
        .then(() => console.log("Recorded log"))
        .catch((error) => console.error("Error recording log", error));

      dataClient
        .recordPrompts([marking.reviewItem.prompt])
        .then(() => console.log("Recorded prompt."))
        .catch((error) => console.error("Error recording prompt", error));
    },
    [authenticationState, userClient, dataClient],
  );

  return (
    <View style={{ position: "relative" }}>
      <ReviewArea
        items={queue}
        onMark={onMark}
        schedule="default"
        shouldLabelApplicationPrompts={true}
      />
      {USER_ID ? null : (
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            textAlign: "center",
            top: "10px",
            width: "100%",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            opacity: 0.5,
          }}
        >
          For prototyping purposes; user data not persisted.
        </div>
      )}
      <AuthenticationStatusIndicator
        authenticationState={authenticationState}
        onSignIn={onSignIn}
      />
    </View>
  );
}

export default App;
