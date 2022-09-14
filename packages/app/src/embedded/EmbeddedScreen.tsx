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
  EmbeddedTaskScreenOnExitReviewEvent,
  EmbeddedTaskScreenOnReviewCompleteEvent,
} from "@withorbit/embedded-support";
import {
  Button,
  IconName,
  ReviewArea,
  ReviewAreaItem,
  ReviewAreaMarkingRecord,
  ReviewStarburst,
  ReviewStarburstItem,
  styles,
  useLayout,
  useTransitioningValue,
} from "@withorbit/ui";
import usePrevious from "@withorbit/ui/dist/components/hooks/usePrevious";

import React, { useEffect, useMemo, useState } from "react";
import { Animated, Platform, View } from "react-native";

import { useAuthenticationClient } from "../authentication/authContext";
import { ReviewSessionContainer } from "../ReviewSessionContainer";
import {
  ReviewSessionManagerState,
  useReviewSessionManager,
} from "../reviewSessionManager";
import { useAPIClient } from "../util/useAPIClient";
import useByrefCallback from "../util/useByrefCallback";
import { useEmbeddedNetworkQueue } from "./embeddedNetworkQueue";
import { sendUpdatedReviewItemToHost } from "./ipc/sendUpdatedReviewItemToHost";
import { useEmbeddedHostState } from "./ipc/useEmbeddedHostState";
import { getActionsRecordForMarking } from "./markingActions";
import { TestModeBanner } from "./TestModeBanner";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "./useEmbeddedAuthenticationState";
import { useRemoteTaskStates } from "./useRemoteTaskStates";
import { findItemsToRetry } from "./util/findItemsToRetry";
import getEmbeddedColorPalette from "./util/getEmbeddedColorPalette";
import getEmbeddedScreenConfigurationFromURL from "./util/getEmbeddedScreenConfigurationFromURL";

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

interface EmbeddedScreenRendererProps extends ReviewSessionManagerState {
  containerSize: { width: number; height: number };
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  onSkip: () => void;
  onUndo: () => void;
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
  onSkip,
  onUndo,
  containerSize,
  colorPalette,
  // hostState,
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
  const { height: interiorHeight, onLayout: onInteriorLayout } = useLayout();

  useEffect(() => {
    if (wasInitiallyComplete) {
      setComplete(true);
    }
  }, [wasInitiallyComplete]);

  const interiorY = useTransitioningValue({
    value: isComplete ? interiorHeight / 2 - 164 : 0,
    timing: {
      type: "spring",
      speed: 2,
      bounciness: 0,
      useNativeDriver: true,
    },
  });

  if (currentReviewAreaQueueIndex >= reviewAreaQueue.length && !isComplete) {
    setTimeout(() => {
      setComplete(true);
      const onReviewCompleteEvent: EmbeddedTaskScreenOnReviewCompleteEvent = {
        type: EmbeddedScreenEventType.OnReviewComplete,
      };
      parent.postMessage(onReviewCompleteEvent, "*");
    }, 350);
  }

  const starburstItems = useMemo(
    () => getStarburstItems(sessionItems),
    [sessionItems],
  );

  const isModalReview =
    Platform.OS === "web" && document.location.hash === "#modal";

  return (
    <View onLayout={onInteriorLayout} style={{ flex: 1 }}>
      <Animated.View
        style={{
          transform: [{ translateY: interiorY }],
          marginBottom: 16,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
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
        {!isComplete && (
          <View style={{ paddingTop: 12, marginRight: 4 }}>
            <Button
              size="small"
              color={colorPalette.reviewButtonTextColor}
              accentColor={colorPalette.accentColor}
              backgroundColor={colorPalette.secondaryBackgroundColor}
              iconName={isModalReview ? IconName.Cross : IconName.List}
              title={isModalReview ? "Exit Review" : "View Prompt List"}
              onPress={() => {
                const exitReviewEvent: EmbeddedTaskScreenOnExitReviewEvent = {
                  type: EmbeddedScreenEventType.OnExitReview,
                };
                parent.postMessage(exitReviewEvent, "*");
              }}
            />
          </View>
        )}
      </Animated.View>
      <ReviewArea
        items={reviewAreaQueue}
        currentItemIndex={currentReviewAreaQueueIndex}
        onMark={onMark}
        onSkip={onSkip}
        onUndo={onUndo}
        onPendingOutcomeChange={(newPendingOutcome) => {
          setPendingOutcome(newPendingOutcome);
        }}
        insetBottom={0}
        getURLForAttachmentID={getURLForAttachmentID}
        canUndo={currentReviewAreaQueueIndex > 0}
      />
      {isDebug && <TestModeBanner colorPalette={colorPalette} />}
    </View>
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

function EmbeddedScreen({
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

  const {
    currentSessionItemIndex,
    currentReviewAreaQueueIndex,
    sessionItems,
    reviewAreaQueue,
    ...reviewSessionManager
  } = useReviewSessionManager();

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
    (
      previousHostState: EmbeddedHostState | null,
      hostState: EmbeddedHostState,
    ) => {
      const reviewItems = getSessionReviewItemsFromHostState(hostState);
      // Accommodate any edits.
      reviewSessionManager.updateSessionItems(() => reviewItems);
      if (previousHostState) {
        const previousReviewItems =
          getSessionReviewItemsFromHostState(previousHostState);
        const previousTaskIDs = new Set(
          previousReviewItems.map((item) => item.task.id),
        );
        const newItems: ReviewItem[] = [];
        for (const item of reviewItems) {
          const taskID = item.task.id;
          if (previousTaskIDs.has(taskID)) {
            previousTaskIDs.delete(taskID);
          } else {
            newItems.push(item);
          }
        }
        if (newItems.length > 0) {
          reviewSessionManager.pushReviewAreaQueueItems(
            getEmbeddedReviewAreaItemsFromReviewItems(newItems, colorPalette),
          );
        }
        if (previousTaskIDs.size > 0) {
          reviewSessionManager.removeReviewAreaQueueItems([...previousTaskIDs]);
        }
      }
    },
  );
  const previousHostState = usePrevious(hostState);
  useEffect(() => {
    if (hostState && hostState.orderedScreenRecords[hostState.receiverIndex]) {
      updateSessionItemsFromHostState(previousHostState ?? null, hostState);
    }
  }, [hostState, previousHostState, updateSessionItemsFromHostState]);

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

          // Propagate those updates to peer embedded screens.
          sendUpdatedReviewItemToHost(
            newState.sessionItems[currentSessionItemIndex].task,
            newState.reviewAreaQueue.length + itemsToRetry.length,
            newState.currentReviewAreaQueueIndex!,
          );
        } else {
          // Update the prototype state
          sendUpdatedReviewItemToHost(
            newState.sessionItems[currentSessionItemIndex].task,
            newState.reviewAreaQueue.length,
            newState.currentReviewAreaQueueIndex!,
          );
        }
      },
    );

    // Send the update to the server.
    if (!configuration.isDebug) {
      commitActionsRecord(actionsRecord);
    }
  }

  function onSkip() {
    reviewSessionManager.markCurrentItem([], (newState) =>
      sendUpdatedReviewItemToHost(
        newState.sessionItems[currentSessionItemIndex!].task,
        newState.reviewAreaQueue.length,
        newState.currentReviewAreaQueueIndex!,
      ),
    );
  }

  function onUndo() {
    reviewSessionManager.undo();
  }

  if (
    currentReviewAreaQueueIndex === null ||
    currentSessionItemIndex === null
  ) {
    return null;
  }

  return (
    <View style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      <ReviewSessionContainer
        colorPalette={colorPalette}
        insets={{ top: 0, bottom: 8, left: 8, right: 4 }}
      >
        {({ containerSize }) => (
          <EmbeddedScreenRenderer
            currentSessionItemIndex={currentSessionItemIndex}
            currentReviewAreaQueueIndex={currentReviewAreaQueueIndex}
            reviewAreaQueue={reviewAreaQueue}
            sessionItems={sessionItems}
            onMark={onMark}
            onSkip={onSkip}
            onUndo={onUndo}
            containerSize={containerSize}
            authenticationState={authenticationState}
            colorPalette={colorPalette}
            hostState={hostState}
            hasUncommittedActions={hasUncommittedActions}
            isDebug={configuration.isDebug}
            wasInitiallyComplete={wasInitiallyComplete}
            getURLForAttachmentID={getURLForAttachmentIDAsync}
          />
        )}
      </ReviewSessionContainer>
    </View>
  );
}

export default function EmbeddedScreenDataWrapper() {
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

  return configuration && <EmbeddedScreen configuration={configuration} />;
}
