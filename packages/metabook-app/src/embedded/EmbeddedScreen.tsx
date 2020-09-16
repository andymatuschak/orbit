import "firebase/functions";
import {
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptRepetitionActionLog,
  PromptRepetitionOutcome,
  PromptTask,
  PromptTaskParameters,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewArea, ReviewAreaMarkingRecord, styles } from "metabook-ui";
import ReviewStarburst from "metabook-ui/dist/components/ReviewStarburst";
import { getWidthSizeClass } from "metabook-ui/dist/styles/layout";

import React, { useState } from "react";
import { Text, View } from "react-native";
import { ReviewSessionWrapper } from "../ReviewSessionWrapper";
import { useAuthenticationClient } from "../util/authContext";
import { getFirebaseFunctions } from "../util/firebase";
import EmbeddedBanner from "./EmbeddedBanner";
import { useEmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState";
import useReviewItems from "./useReviewItems";
import getAttachmentURLsByIDInReviewItem from "./util/getAttachmentURLsByIDInReviewItem";

declare global {
  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
}

export default function EmbeddedScreen() {
  const baseItems = useReviewItems();

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
      if (authenticationState.status === "storageRestricted") {
        // TODO: only do this on Firefox.
        authenticationState.onRequestStorageAccess();
      }

      // TODO: remove duplication with ReviewSession.
      const log: PromptRepetitionActionLog<PromptTaskParameters> = {
        actionLogType: repetitionActionLogType,
        taskID: getIDForPromptTask({
          promptType: marking.reviewItem.prompt.promptType,
          promptID: getIDForPrompt(marking.reviewItem.prompt),
          promptParameters: marking.reviewItem.promptParameters,
        } as PromptTask),
        parentActionLogIDs:
          marking.reviewItem.promptState?.headActionLogIDs ?? [],
        taskParameters: getNextTaskParameters(
          marking.reviewItem.prompt,
          marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
        ),
        outcome: marking.outcome,
        context: null, // TODO
        timestampMillis: Date.now(),
      };

      if (authenticationState.userRecord) {
        const prompt = marking.reviewItem.prompt;

        getFirebaseFunctions()
          .httpsCallable("recordEmbeddedActions")({
            logs: [log],
            promptsByID: { [getIDForPrompt(prompt)]: prompt },
            attachmentURLsByID: getAttachmentURLsByIDInReviewItem(
              marking.reviewItem.prompt,
              marking.reviewItem.attachmentResolutionMap,
            ),
          })
          .then(() => console.log("Recorded action"))
          .catch((error) => console.error(error));
      }

      return log;
    },
    [authenticationState],
  );

  const [
    pendingOutcome,
    setPendingOutcome,
  ] = useState<PromptRepetitionOutcome | null>(null);

  return (
    baseItems && (
      <View style={{ height: "100vh" }}>
        <ReviewSessionWrapper baseItems={baseItems} onMark={onMark}>
          {({
            onMark,
            currentItemIndex,
            items,
            containerWidth,
            containerHeight,
          }) => {
            if (currentItemIndex < items.length) {
              return (
                <>
                  <EmbeddedBanner
                    palette={baseItems[currentItemIndex]}
                    isSignedIn={authenticationState.status === "signedIn"}
                    totalPromptCount={baseItems.length}
                    completePromptCount={currentItemIndex}
                    sizeClass={getWidthSizeClass(containerWidth)}
                  />
                  <ReviewStarburst
                    containerWidth={containerWidth}
                    containerHeight={containerHeight}
                    items={items}
                    currentItemIndex={currentItemIndex}
                    pendingOutcome={pendingOutcome}
                  />
                  <ReviewArea
                    items={items}
                    currentItemIndex={currentItemIndex}
                    onMark={onMark}
                    onPendingOutcomeChange={setPendingOutcome}
                    insetBottom={0}
                  />
                </>
              );
            } else {
              return (
                <View
                  style={{
                    marginLeft: styles.layout.gridUnit, // TODO: use grid layout
                    marginRight: styles.layout.gridUnit,
                  }}
                >
                  <Text
                    style={styles.type.headline.layoutStyle}
                  >{`All caught up!\nNothing's due for review.`}</Text>
                </View>
              );
            }
          }}
        </ReviewSessionWrapper>
      </View>
    )
  );
  /*

  if (mergedItems) {
    return (
      <Animated.View
        style={{ position: "relative", height: "100vh", backgroundColor }}
        onLayout={onLayout}
      >
        <ReviewArea
          items={mergedItems}
          currentItemIndex={currentItemIndex}
          onMark={onMark}
          schedule="default"
        />
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
          <OnboardingModalWeb
            colorPalette={mergedItems[currentItemIndex]}
            sizeClass={sizeClass}
          />
        </View>
      </Animated.View>
    );
  } else {
    return null;
  }*/
}
