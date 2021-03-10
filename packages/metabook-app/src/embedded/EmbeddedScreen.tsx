import {
  getNextTaskParameters,
  PromptRepetitionOutcome,
  promptTypeSupportsRetry,
} from "metabook-core";
import { EmbeddedHostState, ReviewItem } from "@withorbit/embedded-support";
import {
  FadeView,
  ReviewArea,
  ReviewAreaItem,
  ReviewAreaMarkingRecord,
  ReviewStarburst,
  ReviewStarburstItem,
  styles,
  useLayout,
  useTransitioningValue,
} from "metabook-ui";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";

import { useAuthenticationClient } from "../authentication/authContext";
import { ReviewSessionContainer } from "../ReviewSessionContainer";
import {
  ReviewSessionManagerState,
  useReviewSessionManager,
} from "../reviewSessionManager";
import useByrefCallback from "../util/useByrefCallback";
import EmbeddedBanner from "./EmbeddedBanner";
import { useEmbeddedNetworkQueue } from "./embeddedNetworkQueue";
import { sendUpdatedReviewItemToHost } from "./ipc/sendUpdatedReviewItemToHost";
import { getActionsRecordForMarking } from "./markingActions";
import OnboardingModalWeb from "./OnboardingModal.web";
import { TestModeBanner } from "./TestModeBanner";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "./useEmbeddedAuthenticationState";
import { useEmbeddedHostState } from "./ipc/useEmbeddedHostState";
import { useInitialPromptStates } from "./useInitialPromptStates";
import useResolvedReviewItems from "./useResolvedReviewItems";
import { findItemsToRetry } from "./util/findItemsToRetry";
import getEmbeddedColorPalette from "./util/getEmbeddedColorPalette";
import getEmbeddedScreenConfigurationFromURL from "./util/getEmbeddedScreenConfigurationFromURL";

function getStarburstItems(sessionItems: ReviewItem[]): ReviewStarburstItem[] {
  return sessionItems.map((item) => ({
    isPendingForSession: !item.promptState, // TODO for retry
    promptState: item.promptState,
    supportsRetry: promptTypeSupportsRetry(item.prompt.promptType),
  }));
}

function getEndOfTaskLabel(
  starburstItems: ReviewStarburstItem[],
  hasPeerStates: boolean,
): string {
  const promptString = starburstItems.length > 1 ? "prompts" : "prompt";
  if (hasPeerStates) {
    const collectedCount = starburstItems.filter((state) => !!state.promptState)
      .length;
    return `${collectedCount} of ${starburstItems.length} prompts on page collected`;
  } else {
    return `${starburstItems.length} ${promptString} collected`;
  }
}

interface EmbeddedScreenRendererProps extends ReviewSessionManagerState {
  containerSize: { width: number; height: number };
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  authenticationState: EmbeddedAuthenticationState;
  colorPalette: styles.colors.ColorPalette;
  hostState: EmbeddedHostState | null;
  hasUncommittedActions: boolean;
  isDebug?: boolean;

  // these review session manager fields can't be null
  currentReviewAreaQueueIndex: number;
  currentSessionItemIndex: number;

  wasInitiallyComplete: boolean;
}
function EmbeddedScreenRenderer({
  onMark,
  containerSize,
  authenticationState,
  colorPalette,
  hostState,
  hasUncommittedActions,
  isDebug,
  currentSessionItemIndex,
  currentReviewAreaQueueIndex,
  sessionItems,
  reviewAreaQueue,
  wasInitiallyComplete,
}: EmbeddedScreenRendererProps) {
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
  const { height: modalHeight, onLayout: onModalLayout } = useLayout();

  useEffect(() => {
    if (wasInitiallyComplete) {
      setComplete(true);
    }
  }, [wasInitiallyComplete]);

  const interiorY = useTransitioningValue({
    value: isComplete
      ? (window.innerHeight -
          interiorHeight -
          (authenticationState.status !== "signedIn" ? modalHeight : 0)) /
          2 -
        styles.layout.gridUnit * 4
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

  if (currentReviewAreaQueueIndex >= reviewAreaQueue.length && !isComplete) {
    setTimeout(() => setComplete(true), 350);
    setTimeout(() => {
      // There are bugs with RNW's implementation of delay with spring animations, alas.
      if (authenticationState.status !== "signedIn") {
        setShouldShowOnboardingModal(true);
      }
    }, 750);
  }

  const starburstItems = useMemo(() => getStarburstItems(sessionItems), [
    sessionItems,
  ]);

  return (
    <>
      <EmbeddedBanner
        palette={colorPalette}
        isSignedIn={authenticationState.status === "signedIn"}
        totalPromptCount={reviewAreaQueue.length}
        completePromptCount={currentReviewAreaQueueIndex}
        wasInitiallyComplete={wasInitiallyComplete}
        sizeClass={styles.layout.getWidthSizeClass(containerSize.width)}
      />
      <Animated.View
        onLayout={onInteriorLayout}
        style={{ transform: [{ translateY: interiorY }] }}
      >
        <ReviewStarburst
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
          items={starburstItems}
          currentItemIndex={currentSessionItemIndex}
          pendingOutcome={pendingOutcome}
          position={isComplete ? "center" : "left"}
          showLegend={
            currentReviewAreaQueueIndex < reviewAreaQueue.length &&
            !wasInitiallyComplete
          }
          colorMode={isComplete ? "accent" : "bicolor"}
          colorPalette={colorPalette}
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
            {getEndOfTaskLabel(starburstItems, !!hostState)}
          </Text>
        </FadeView>
        <FadeView
          isVisible={
            isComplete && !wasInitiallyComplete && !hasUncommittedActions
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
          items={reviewAreaQueue}
          currentItemIndex={currentReviewAreaQueueIndex}
          onMark={onMark}
          onPendingOutcomeChange={(newPendingOutcome) => {
            setPendingOutcome(newPendingOutcome);
          }}
          insetBottom={0}
        />
      )}
      {isComplete && (
        <>
          <View style={{ flex: 1 }} />
          <Animated.View
            style={{
              overflow: "hidden",
              transform: [{ translateY: onboardingOffsetY }],
            }}
            onLayout={onModalLayout}
          >
            <OnboardingModalWeb
              colorPalette={colorPalette}
              sizeClass={styles.layout.getWidthSizeClass(containerSize.width)}
            />
          </Animated.View>
        </>
      )}
      {isDebug && <TestModeBanner colorPalette={colorPalette} />}
    </>
  );
}

function getSessionReviewItemsFromHostState(
  hostState: EmbeddedHostState,
): ReviewItem[] {
  const itemLists = hostState.orderedScreenRecords.map(
    (screenRecord) => screenRecord?.reviewItems ?? [],
  );
  return itemLists.reduce((whole, part) => whole.concat(part), []);
}

function getEmbeddedReviewAreaItemsFromReviewItems(
  reviewItems: ReviewItem[],
  colorPalette: styles.colors.ColorPalette,
): ReviewAreaItem[] {
  return reviewItems.map((item) => ({
    prompt: item.prompt,
    promptParameters: item.promptParameters,
    taskParameters: getNextTaskParameters(
      item.prompt,
      item.promptState?.lastReviewTaskParameters ?? null,
    ),
    provenance: null, // We don't show provenance in the embedded UI.
    attachmentResolutionMap: item.attachmentResolutionMap,
    colorPalette,
  }));
}

export default function EmbeddedScreen() {
  const configuration = useRef(
    getEmbeddedScreenConfigurationFromURL(window.location.href),
  ).current;
  const colorPalette = useMemo(() => getEmbeddedColorPalette(configuration), [
    configuration,
  ]);

  const authenticationClient = useAuthenticationClient();
  const authenticationState = useEmbeddedAuthenticationState(
    authenticationClient,
  );

  const {
    currentSessionItemIndex,
    currentReviewAreaQueueIndex,
    sessionItems,
    reviewAreaQueue,
    ...reviewSessionManager
  } = useReviewSessionManager();
  const {
    commitActionsRecord,
    hasUncommittedActions,
  } = useEmbeddedNetworkQueue(authenticationState.status);

  const hostState = useEmbeddedHostState();
  const embeddedReviewItems = useResolvedReviewItems(
    configuration.embeddedItems,
    document.referrer,
  );

  // When the initial queue becomes available, add it to the review session manager.
  const enqueueInitialItems = useByrefCallback(
    (embeddedReviewItems: ReviewItem[]) => {
      reviewSessionManager.updateSessionItems(() =>
        hostState && hostState.orderedScreenRecords[hostState.receiverIndex]
          ? getSessionReviewItemsFromHostState(hostState)
          : embeddedReviewItems,
      );
      reviewSessionManager.pushReviewAreaQueueItems(
        getEmbeddedReviewAreaItemsFromReviewItems(
          embeddedReviewItems,
          colorPalette,
        ),
      );
    },
  );
  useEffect(() => {
    if (embeddedReviewItems) {
      enqueueInitialItems(embeddedReviewItems);
    }
  }, [embeddedReviewItems, enqueueInitialItems]);

  // Update the review session manager when we get a new set of items from the host.
  const updateSessionItemsFromHostState = useByrefCallback(
    (hostState: EmbeddedHostState) => {
      reviewSessionManager.updateSessionItems(() =>
        getSessionReviewItemsFromHostState(hostState),
      );
    },
  );
  useEffect(() => {
    if (hostState && hostState.orderedScreenRecords[hostState.receiverIndex]) {
      updateSessionItemsFromHostState(hostState);
    }
  }, [hostState, updateSessionItemsFromHostState]);

  const initialPromptStates = useInitialPromptStates({
    authenticationClient: authenticationClient,
    authenticationState: authenticationState,
    embeddedReviewItems: embeddedReviewItems,
    shouldRequestInitialPrompts: currentReviewAreaQueueIndex === 0,
  });
  const [wasInitiallyComplete, setWasInitiallyComplete] = useState(false);
  const updateSessionItemsFromInitialPromptStates = useByrefCallback(() => {
    if (initialPromptStates && embeddedReviewItems) {
      // Potential races abound here, but in practice I don't think they actually matter.
      reviewSessionManager.updateSessionItems((sessionItems) =>
        sessionItems.map((item) => {
          const initialPromptState = initialPromptStates.get(item.promptTaskID);
          return initialPromptState
            ? {
                ...item,
                promptState: initialPromptState,
              }
            : item;
        }),
      );

      setWasInitiallyComplete(
        embeddedReviewItems.every((item) =>
          initialPromptStates.has(item.promptTaskID),
        ),
      );
    }
  });
  useEffect(() => {
    updateSessionItemsFromInitialPromptStates();
  }, [initialPromptStates, updateSessionItemsFromInitialPromptStates]);

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    if (currentSessionItemIndex === null) {
      throw new Error("Marking without valid currentSessionItemIndex");
    }
    const actionsRecord = getActionsRecordForMarking({
      hostMetadata: configuration.embeddedHostMetadata,
      markingRecord: markingRecord,
      reviewItem: sessionItems[currentSessionItemIndex],
      sessionStartTimestampMillis: configuration.sessionStartTimestampMillis,
    });

    // Update our local records for this item.
    reviewSessionManager.markCurrentItem(
      // When marking some embedded prompts (e.g. clozes), logs for multiple task IDs are generated, but the review session manager expects only to receive logs for the current item, so we filter others out.
      actionsRecord.logEntries.filter(
        ({ log }) =>
          log.taskID === sessionItems[currentSessionItemIndex].promptTaskID,
      ),
      (newState) => {
        // Propagate those updates to peer embedded screens.
        const updatedReviewItem =
          newState.sessionItems[currentSessionItemIndex];
        if (!updatedReviewItem.promptState)
          throw new Error("Item should have prompt state after marking");
        sendUpdatedReviewItemToHost(
          updatedReviewItem.promptTaskID,
          updatedReviewItem.promptState,
        );

        // If we were at the end of our queue, refill it with items needing retry.
        if (
          newState.currentReviewAreaQueueIndex !== null &&
          newState.currentReviewAreaQueueIndex >=
            newState.reviewAreaQueue.length &&
          hostState
        ) {
          const itemsToRetry = findItemsToRetry(
            newState.sessionItems,
            hostState,
          );
          console.log("Pushing items to retry", itemsToRetry);
          reviewSessionManager.pushReviewAreaQueueItems(
            getEmbeddedReviewAreaItemsFromReviewItems(
              itemsToRetry,
              colorPalette,
            ),
          );
        }
      },
    );

    // Send the update to the server.
    if (!configuration.isDebug) {
      commitActionsRecord(actionsRecord);
    }
  }

  if (
    embeddedReviewItems === null ||
    currentReviewAreaQueueIndex === null ||
    currentSessionItemIndex === null
  ) {
    return null; // TODO show loading screen: we may be resolving attachments.
  }

  return (
    <View style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      <ReviewSessionContainer colorPalette={colorPalette}>
        {({ containerSize }) => (
          <EmbeddedScreenRenderer
            currentSessionItemIndex={currentSessionItemIndex}
            currentReviewAreaQueueIndex={currentReviewAreaQueueIndex}
            reviewAreaQueue={reviewAreaQueue}
            sessionItems={sessionItems}
            onMark={onMark}
            containerSize={containerSize}
            authenticationState={authenticationState}
            colorPalette={colorPalette}
            hostState={hostState}
            hasUncommittedActions={hasUncommittedActions}
            isDebug={configuration.isDebug}
            wasInitiallyComplete={wasInitiallyComplete}
          />
        )}
      </ReviewSessionContainer>
    </View>
  );
}
