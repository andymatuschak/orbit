import {
  Authentication,
  getDefaultFirebaseApp,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewArea, ReviewAreaMarkingRecord } from "metabook-ui";

import BigButton from "metabook-ui/dist/components/BigButton";
import colors from "metabook-ui/dist/styles/colors";
import { spacing } from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";

import React from "react";
import { Text, View } from "react-native";
import {
  AuthenticationState,
  useAuthenticationState,
} from "./useAuthenticationState";
import useReviewItems from "./useReviewItems";

declare global {
  // supplied by Webpack
  const USER_ID: string | null;

  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
}

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

function App() {
  const items = useReviewItems();
  const [queueOffset, setQueueOffset] = React.useState(0);

  const [{ userClient, authenticationClient }] = React.useState(() => {
    const app = getDefaultFirebaseApp();
    const firestore = app.firestore();
    return {
      userClient: new MetabookFirebaseUserClient(firestore, "demo"),
      authenticationClient: new Authentication.FirebaseAuthenticationClient(
        app.auth(),
      ),
    };
  });

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
      setQueueOffset((queueOffset) => queueOffset + 1);

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

      // dataClient
      //   .recordPrompts([marking.reviewItem.prompt])
      //   .then(() => console.log("Recorded prompt."))
      //   .catch((error) => console.error("Error recording prompt", error));
    },
    [authenticationState, userClient],
  );

  const currentQueue = React.useMemo(() => items?.slice(queueOffset), [
    queueOffset,
    items,
  ]);
  if (currentQueue) {
    return (
      <View style={{ position: "relative" }}>
        <ReviewArea
          items={currentQueue}
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
  } else {
    return null;
  }
}

export default App;
