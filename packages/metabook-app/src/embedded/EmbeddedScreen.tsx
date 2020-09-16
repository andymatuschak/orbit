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
import {
  ReviewArea,
  ReviewAreaMarkingRecord,
  ReviewStarburst,
  styles,
  useLayout,
  useTransitioningValue,
} from "metabook-ui";
import FadeView from "metabook-ui/dist/components/FadeView";
import { getWidthSizeClass } from "metabook-ui/dist/styles/layout";

import React, { useState, useEffect, useCallback } from "react";
import { Animated, Text, View } from "react-native";
import { ReviewSessionWrapper } from "../ReviewSessionWrapper";
import { useAuthenticationClient } from "../util/authContext";
import { getFirebaseFunctions } from "../util/firebase";
import EmbeddedBanner from "./EmbeddedBanner";
import OnboardingModalWeb from "./OnboardingModal.web";
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

  const onMark = useCallback(
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

  const [isComplete, setComplete] = useState(false);
  const [shouldShowOnboardingModal, setShouldShowOnboardingModal] = useState(
    false,
  );
  useEffect(() => {
    if (authenticationState.status === "signedIn") {
      setShouldShowOnboardingModal(false);
    }
  }, [authenticationState]);
  const { height: interiorHeight, onLayout: onInteriorLayout } = useLayout();
  const interiorY = useTransitioningValue({
    value:
      isComplete && authenticationState.status === "signedIn"
        ? (window.innerHeight - interiorHeight) / 2 - styles.layout.gridUnit * 4
        : 0,
    timing: {
      type: "spring",
      speed: 2,
      bounciness: 0,
      useNativeDriver: true,
    },
  });

  const onboardingOffsetY = useTransitioningValue({
    value: shouldShowOnboardingModal ? 0 : window.innerHeight,
    timing: {
      type: "spring",
      speed: 3,
      bounciness: 0,
      useNativeDriver: true,
    },
  });

  return (
    baseItems !== null && (
      <View style={{ height: "100vh" }}>
        <ReviewSessionWrapper baseItems={baseItems} onMark={onMark}>
          {({
            onMark,
            currentItemIndex,
            items,
            containerWidth,
            containerHeight,
          }) => {
            if (currentItemIndex >= items.length && !isComplete) {
              setTimeout(() => setComplete(true), 350);
              setTimeout(() => {
                // There are bugs with RNW's implementation of delay with spring animations, alas.
                if (authenticationState.status !== "signedIn") {
                  setShouldShowOnboardingModal(true);
                }
              }, 750);
            }
            const colorPalette =
              baseItems[Math.min(currentItemIndex, items.length - 1)];
            return (
              <>
                <EmbeddedBanner
                  palette={colorPalette}
                  isSignedIn={authenticationState.status === "signedIn"}
                  totalPromptCount={baseItems.length}
                  completePromptCount={currentItemIndex}
                  sizeClass={getWidthSizeClass(containerWidth)}
                />
                <Animated.View
                  onLayout={onInteriorLayout}
                  style={{ transform: [{ translateY: interiorY }] }}
                >
                  <ReviewStarburst
                    containerWidth={containerWidth}
                    containerHeight={containerHeight}
                    items={items}
                    currentItemIndex={Math.min(
                      currentItemIndex,
                      items.length - 1,
                    )}
                    pendingOutcome={pendingOutcome}
                    position={isComplete ? "center" : "left"}
                    showLegend={
                      currentItemIndex <
                      items.length /* animate out the legend a little early */
                    }
                    colorMode={isComplete ? "accent" : "bicolor"}
                  />
                  <FadeView
                    isVisible={isComplete}
                    delayMillis={500}
                    removeFromLayoutWhenHidden
                  >
                    <Text
                      style={[
                        styles.type.label.layoutStyle,
                        {
                          textAlign: "center",
                          color: styles.colors.white,
                          marginBottom: styles.layout.gridUnit * 2,
                        },
                      ]}
                    >
                      {baseItems.length} prompts collected
                    </Text>
                  </FadeView>
                  <FadeView
                    isVisible={
                      /* TODO: show this after saving is actually complete */
                      isComplete && authenticationState.status === "signedIn"
                    }
                    delayMillis={750}
                    removeFromLayoutWhenHidden
                  >
                    <Text
                      style={[
                        styles.type.labelSmall.layoutStyle,
                        {
                          textAlign: "center",
                          color: colorPalette.secondaryTextColor,
                        },
                      ]}
                    >
                      Saved to your account:
                      <br />
                      {authenticationState.userRecord?.emailAddress}
                    </Text>
                  </FadeView>
                </Animated.View>
                {!isComplete && (
                  <ReviewArea
                    items={items}
                    currentItemIndex={currentItemIndex}
                    onMark={onMark}
                    onPendingOutcomeChange={setPendingOutcome}
                    insetBottom={0}
                  />
                )}
                {isComplete && (
                  <Animated.View
                    style={{
                      flex: 1,
                      justifyContent: "flex-end",
                      overflow: "hidden",
                      transform: [{ translateY: onboardingOffsetY }],
                    }}
                  >
                    <OnboardingModalWeb
                      colorPalette={colorPalette}
                      sizeClass={getWidthSizeClass(containerWidth)}
                    />
                  </Animated.View>
                )}
              </>
            );
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
