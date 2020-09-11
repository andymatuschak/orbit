import "firebase/functions";
import {
  ActionLog,
  applyActionLogToPromptState,
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getPromptActionLogFromActionLog,
  PromptState,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import {
  ReviewArea,
  ReviewAreaMarkingRecord,
  styles,
  useLayout,
  useTransitioningColorValue,
} from "metabook-ui";

import BigButton from "metabook-ui/dist/components/BigButton";
import { getWidthSizeClass } from "metabook-ui/dist/styles/layout";

import React from "react";
import { Animated, Easing, Text, View } from "react-native";
import { useAuthenticationClient } from "../util/authContext";
import { getFirebaseFunctions } from "../util/firebase";
import EmbeddedBanner from "./EmbeddedBanner";
import OnboardingModalWeb from "./OnboardingModal.web";
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
          style={[
            styles.type.caption.layoutStyle,
            { color: styles.colors.ink },
          ]}
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
        left: styles.layout.gridUnit,
        bottom: styles.layout.gridUnit,
      }}
    >
      {interior}
    </View>
  );
}

export default function EmbeddedScreen() {
  const items = useReviewItems();
  const [localPromptStates, setLocalPromptStates] = React.useState<
    PromptState[]
  >([]);

  const [currentItemIndex, setCurrentItemIndex] = React.useState(0);

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
      setCurrentItemIndex((index) => {
        const newState = applyActionLogToPromptState({
          schedule: "default",
          basePromptState: marking.reviewItem.promptState,
          promptActionLog: getPromptActionLogFromActionLog(logs[0]),
          actionLogID: getIDForActionLog(logs[0]),
        });
        if (newState instanceof Error) {
          throw newState;
        }
        setLocalPromptStates((localPromptStates) => [
          ...localPromptStates,
          newState,
        ]);

        return index + 1;
      });

      if (authenticationState.userRecord) {
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

  // TODO: fix duplication with ReviewSession
  const backgroundColor = useTransitioningColorValue({
    value: items
      ? items[currentItemIndex].backgroundColor
      : styles.colors.white,
    timing: {
      type: "timing",
      duration: 150,
      easing: Easing.linear,
      useNativeDriver: false,
    },
  });

  const mergedItems = React.useMemo(
    () =>
      items?.map((item, index) =>
        localPromptStates[index]
          ? { ...item, promptState: localPromptStates[index] }
          : item,
      ),
    [items, localPromptStates],
  );

  const { width, onLayout } = useLayout();

  if (mergedItems) {
    return (
      <Animated.View
        style={{ position: "relative", height: "100vh", backgroundColor }}
        onLayout={onLayout}
      >
        <EmbeddedBanner
          palette={mergedItems[currentItemIndex]}
          isSignedIn={authenticationState.status === "signedIn"}
          totalPromptCount={mergedItems.length}
          completePromptCount={currentItemIndex}
          sizeClass={width ? getWidthSizeClass(width) : "compact"}
        />
        <ReviewArea
          items={mergedItems}
          currentItemIndex={currentItemIndex}
          onMark={onMark}
          schedule="default"
        />
        <AuthenticationStatusIndicator
          authenticationState={authenticationState}
          onSignIn={onSignIn}
        />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <OnboardingModalWeb colorPalette={mergedItems[currentItemIndex]} />
        </View>
      </Animated.View>
    );
  } else {
    return null;
  }
}
