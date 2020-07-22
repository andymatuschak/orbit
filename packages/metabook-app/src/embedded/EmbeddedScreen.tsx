import "firebase/functions";
import {
  ActionLog,
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
import { useAuthenticationClient } from "../util/authContext";
import { getFirebaseFunctions } from "../util/firebase";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "./useEmbeddedAuthenticationState";
import useReviewItems from "./useReviewItems";
import getAttachmentURLsByIDInReviewItem from "./util/getAttachmentURLsByIDInReviewItem";

declare global {
  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
}

function AuthenticationStatusIndicator(props: {
  authenticationState: EmbeddedAuthenticationState;
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

function EmbeddedScreen() {
  const items = useReviewItems();
  const [queueOffset, setQueueOffset] = React.useState(0);

  const authenticationClient = useAuthenticationClient();
  const authenticationState = useEmbeddedAuthenticationState(
    authenticationClient,
  );

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

      if (authenticationState.userRecord) {
        // Ingest prompt for user
        const promptTask = {
          promptType: marking.reviewItem.prompt.promptType,
          promptID: getIDForPrompt(marking.reviewItem.prompt),
          promptParameters: marking.reviewItem.promptParameters,
        } as PromptTask;

        const logs: ActionLog[] = [
          {
            actionLogType: repetitionActionLogType,
            taskID: getIDForPromptTask(promptTask),
            parentActionLogIDs: [],
            taskParameters: null,
            outcome: marking.outcome,
            context: null,
            timestampMillis: Date.now(),
          },
        ];

        const prompt = marking.reviewItem.prompt;

        getFirebaseFunctions()
          .httpsCallable("recordEmbeddedActions")({
            logs,
            promptsByID: { [getIDForPrompt(prompt)]: prompt },
            attachmentURLsByID: getAttachmentURLsByIDInReviewItem(
              marking.reviewItem.prompt,
              marking.reviewItem.attachmentResolutionMap,
            ),
          })
          .then(() => console.log("Recorded action"))
          .catch((error) => console.error(error));
      }
    },
    [authenticationState],
  );

  const currentQueue = React.useMemo(() => items?.slice(queueOffset), [
    queueOffset,
    items,
  ]);
  if (currentQueue) {
    return (
      <View style={{ position: "relative" }}>
        <ReviewArea items={currentQueue} onMark={onMark} schedule="default" />
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

export default EmbeddedScreen;
