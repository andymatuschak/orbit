import {
  AttachmentID,
  defaultSpacedRepetitionSchedulerConfiguration,
  EventForEntity,
  ReviewItem,
  Task,
  TaskID,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import {
  EmbeddedHostEventType,
  EmbeddedHostInitialConfigurationEvent,
  EmbeddedHostState,
  EmbeddedScreenConfiguration,
  EmbeddedScreenEventType,
  EmbeddedScreenOnLoadEvent,
} from "@withorbit/embedded-support";
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
} from "@withorbit/ui";

import React, { useEffect, useMemo, useState } from "react";
import { Animated, Text, View } from "react-native";

import { useAuthenticationClient } from "../../authentication/authContext.js";
import { ReviewSessionContainer } from "../../ReviewSessionContainer.js";
import {
  ReviewSessionManagerState,
  useReviewSessionManager,
} from "../../reviewSessionManager.js";
import { useAPIClient } from "../../util/useAPIClient.js";
import useByrefCallback from "../../util/useByrefCallback.js";
import EmbeddedBanner from "../../embedded/EmbeddedBanner.js";
import { useEmbeddedNetworkQueue } from "../../embedded/embeddedNetworkQueue.js";
import { sendUpdatedReviewItemToHost } from "../../embedded/ipc/sendUpdatedReviewItemToHost.js";
import { useEmbeddedHostState } from "../../embedded/ipc/useEmbeddedHostState.js";
import { getActionsRecordForMarking } from "../../embedded/markingActions.js";
import OnboardingModalWeb from "../../embedded/OnboardingModal.web.js";
import { TestModeBanner } from "../../embedded/TestModeBanner.js";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "../../embedded/useEmbeddedAuthenticationState.js";
import { useRemoteTaskStates } from "../../embedded/useRemoteTaskStates.js";
import { findItemsToRetry } from "../../embedded/util/findItemsToRetry.js";
import getEmbeddedColorPalette from "../../embedded/util/getEmbeddedColorPalette.js";
import getEmbeddedScreenConfigurationFromURL from "../../embedded/util/getEmbeddedScreenConfigurationFromURL.js";

function getStarburstItems(sessionItems: ReviewItem[]): ReviewStarburstItem[] {
  return sessionItems.map((item) => {
    const componentState = item.task.componentStates[item.componentID];
    return {
      component: componentState,
      isPendingForSession:
        componentState.lastRepetitionTimestampMillis === null,
    };
  });
}

function getEndOfTaskLabel(
  starburstItems: ReviewStarburstItem[],
  hasPeerStates: boolean,
): string {
  const promptString = starburstItems.length > 1 ? "prompts" : "prompt";
  if (hasPeerStates) {
    const collectedCount = starburstItems.filter(
      (state) => !state.isPendingForSession,
    ).length;
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
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;

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
  getURLForAttachmentID,
  currentSessionItemIndex,
  currentReviewAreaQueueIndex,
  sessionItems,
  reviewAreaQueue,
  wasInitiallyComplete,
}: EmbeddedScreenRendererProps) {
  const [pendingOutcome, setPendingOutcome] =
    useState<TaskRepetitionOutcome | null>(null);

  const [isComplete, setComplete] = useState(false);
  const [shouldShowOnboardingModal, setShouldShowOnboardingModal] =
    useState(false);
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

  const widthSizeClass = styles.layout.getWidthSizeClass(containerSize.width);
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

  const starburstItems = useMemo(
    () => getStarburstItems(sessionItems),
    [sessionItems],
  );

  return (
    <>
      <EmbeddedBanner
        palette={colorPalette}
        isSignedIn={authenticationState.status === "signedIn"}
        totalPromptCount={reviewAreaQueue.length}
        completePromptCount={currentReviewAreaQueueIndex}
        wasInitiallyComplete={wasInitiallyComplete}
        sizeClass={widthSizeClass}
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
          config={defaultSpacedRepetitionSchedulerConfiguration}
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
          sizeClass={widthSizeClass}
          getURLForAttachmentID={getURLForAttachmentID}
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
              sizeClass={widthSizeClass}
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
    taskID: item.task.id,
    spec: item.task.spec,
    componentID: item.componentID,
    provenance: null, // We don't show provenance in the embedded UI.
    colorPalette,
  }));
}

function EmbeddedPage({
  configuration,
}: {
  configuration: EmbeddedScreenConfiguration;
}) {
  const colorPalette = useMemo(
    () => getEmbeddedColorPalette(configuration),
    [configuration],
  );

  const authenticationClient = useAuthenticationClient();
  const authenticationState =
    useEmbeddedAuthenticationState(authenticationClient);
  const apiClient = useAPIClient(authenticationClient);

  const reviewSessionManager = useReviewSessionManager();

  // Add the initial queue to the review session manager.
  const enqueueInitialItems = useByrefCallback(
    (embeddedReviewItems: ReviewItem[]) => {
      reviewSessionManager.updateSessionItems(() => embeddedReviewItems);
      reviewSessionManager.pushReviewAreaQueueItems(
        getEmbeddedReviewAreaItemsFromReviewItems(
          embeddedReviewItems,
          colorPalette,
        ),
      );
    },
  );
  useEffect(() => {
    enqueueInitialItems(configuration.reviewItems);
  }, [configuration.reviewItems, enqueueInitialItems]);

  // Update the review session manager when we get a new set of items from the host.
  const hostState = useEmbeddedHostState();
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

  // Load the states for these tasks as they exist on the server and merge into our local session state.
  const remoteTaskStates = useRemoteTaskStates({
    apiClient,
    authenticationState,
    embeddedReviewItems: configuration.reviewItems,
  });

  // TODO: account for tasks which need retry
  const wasInitiallyComplete = useMemo(
    () =>
      remoteTaskStates
        ? configuration.reviewItems.every((item) =>
            remoteTaskStates.has(item.task.id),
          )
        : false,
    [remoteTaskStates, configuration.reviewItems],
  );

  const updateSessionItemsFromRemoteTaskStates = useByrefCallback(
    (remoteTaskStates: Map<TaskID, Task>) => {
      // Potential races abound here, but in practice I don't think they actually matter.
      reviewSessionManager.updateSessionItems((sessionItems) =>
        sessionItems.map((item) => {
          const initialTaskState = remoteTaskStates.get(item.task.id);
          return initialTaskState ? { ...item, task: initialTaskState } : item;
        }),
      );
    },
  );
  useEffect(() => {
    if (remoteTaskStates) {
      updateSessionItemsFromRemoteTaskStates(remoteTaskStates);
    }
  }, [remoteTaskStates, updateSessionItemsFromRemoteTaskStates]);

  const getURLForAttachmentID = useByrefCallback((id: AttachmentID) => {
    let url: string | undefined = configuration.attachmentIDsToURLs[id];
    if (url) return url;
    for (const record of hostState?.orderedScreenRecords ?? []) {
      url = record?.attachmentIDsToURLs[id];
      if (url) return url;
    }
    return null;
  });
  const getURLForAttachmentIDAsync = useByrefCallback(
    async (id: AttachmentID) => getURLForAttachmentID(id),
  );

  const { commitActionsRecord, hasUncommittedActions } =
    useEmbeddedNetworkQueue(authenticationState.status, apiClient);

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    const { currentSessionItemIndex, sessionItems } = reviewSessionManager;
    if (currentSessionItemIndex === null) {
      throw new Error("Marking without valid currentSessionItemIndex");
    }
    const actionsRecord = getActionsRecordForMarking({
      hostMetadata: configuration.embeddedHostMetadata,
      outcome: markingRecord.outcome,
      reviewItem: sessionItems[currentSessionItemIndex],
      sessionStartTimestampMillis: configuration.sessionStartTimestampMillis,
      getURLForAttachmentID,
    });

    // Update our local records for this item.
    reviewSessionManager.markCurrentItem(
      actionsRecord.events.filter(
        (e): e is EventForEntity<Task> =>
          e.entityID === markingRecord.reviewAreaItem.taskID,
      ),
      (newState) => {
        // Propagate those updates to peer embedded screens.
        sendUpdatedReviewItemToHost(
          newState.sessionItems[currentSessionItemIndex].task,
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

  return (
    <View style={{ height: "100%", width: "100%", overflow: "hidden" }}>
      <ReviewSessionContainer colorPalette={colorPalette}>
        {({ containerSize }) => {
          const { currentReviewAreaQueueIndex, currentSessionItemIndex } =
            reviewSessionManager;
          if (
            currentReviewAreaQueueIndex === null ||
            currentSessionItemIndex === null
          ) {
            return null;
          }
          return (
            <EmbeddedScreenRenderer
              {...reviewSessionManager}
              currentReviewAreaQueueIndex={currentReviewAreaQueueIndex}
              currentSessionItemIndex={currentSessionItemIndex}
              onMark={onMark}
              containerSize={containerSize}
              authenticationState={authenticationState}
              colorPalette={colorPalette}
              hostState={hostState}
              hasUncommittedActions={hasUncommittedActions}
              isDebug={configuration.isDebug}
              wasInitiallyComplete={wasInitiallyComplete}
              getURLForAttachmentID={getURLForAttachmentIDAsync}
            />
          );
        }}
      </ReviewSessionContainer>
    </View>
  );
}

export default function EmbeddedPageDataWrapper() {
  // For debug and development purposes, the configuration information can be supplied in a URL query parameter.
  const [configuration, setConfiguration] =
    useState<EmbeddedScreenConfiguration | null>(
      getEmbeddedScreenConfigurationFromURL(window.location.href),
    );

  // But normally we'll request it from the host on load.
  useEffect(() => {
    if (configuration === null) {
      function onMessage(event: MessageEvent) {
        if (
          event.source === parent &&
          event.data &&
          event.data.type === EmbeddedHostEventType.InitialConfiguration
        ) {
          const updateEvent: EmbeddedHostInitialConfigurationEvent = event.data;
          setConfiguration(updateEvent.configuration);
        }
      }
      window.addEventListener("message", onMessage);

      const onLoadEvent: EmbeddedScreenOnLoadEvent = {
        type: EmbeddedScreenEventType.OnLoad,
      };
      parent.postMessage(onLoadEvent, "*");

      return () => {
        window.removeEventListener("message", onMessage);
      };
    }
  }, [configuration]);

  return configuration && <EmbeddedPage configuration={configuration} />;
}
