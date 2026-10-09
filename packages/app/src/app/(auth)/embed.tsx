import {
  AttachmentID,
  defaultSpacedRepetitionSchedulerConfiguration,
  generateUniqueID,
  ReviewItem,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import {
  type EmbeddedHostState,
  type EmbeddedScreenConfiguration,
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
} from "../../ui/index.js";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";

import { useAuthenticationClient } from "../../authentication/authContext.js";
import { ReviewSessionContainer } from "../../ReviewSessionContainer.js";
import {
  ReviewSessionManagerState,
  useReviewSessionManager,
} from "../../reviewSessionManager.js";
import useByrefCallback from "../../util/useByrefCallback.js";
import EmbeddedBanner from "../../embedded/EmbeddedBanner.js";
import { EmbeddedHostBridge } from "../../embedded/embeddedHostBridge.js";
import { useEmbeddedHostState } from "../../embedded/ipc/useEmbeddedHostState.js";
import OnboardingModalWeb from "../../embedded/OnboardingModal.web.js";
import { TestModeBanner } from "../../embedded/TestModeBanner.js";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "../../embedded/useEmbeddedAuthenticationState.js";
import { useEmbeddedReviewSession } from "../../embedded/useEmbeddedReviewSession.js";
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
  isSaving: boolean;
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
  isSaving,
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

  const reviewQueueIsComplete =
    wasInitiallyComplete ||
    currentReviewAreaQueueIndex >= reviewAreaQueue.length;
  useEffect(() => {
    if (!reviewQueueIsComplete) return;
    const completionTimeout = setTimeout(() => setComplete(true), 350);
    const onboardingTimeout = setTimeout(() => {
      if (authenticationState.status !== "signedIn") {
        setShouldShowOnboardingModal(true);
      }
    }, 750);
    return () => {
      clearTimeout(completionTimeout);
      clearTimeout(onboardingTimeout);
    };
  }, [authenticationState.status, reviewQueueIsComplete]);

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
          isVisible={isComplete && !wasInitiallyComplete}
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
            {isDebug
              ? "Preview only—progress is not saved"
              : authenticationState.status === "signedIn"
                ? hasUncommittedActions
                  ? "Not yet saved—keep this page open and try again"
                  : `Saved to your account: ${authenticationState.userRecord.emailAddress}`
                : "Sign in to save these prompts and your progress"}
          </Text>
        </FadeView>
      </Animated.View>
      {!isComplete && (
        <View style={{ flex: 1 }} pointerEvents={isSaving ? "none" : "auto"}>
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
        </View>
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
  hostBridge,
}: {
  configuration: EmbeddedScreenConfiguration;
  hostBridge: EmbeddedHostBridge;
}) {
  const colorPalette = useMemo(
    () => getEmbeddedColorPalette(configuration),
    [configuration],
  );
  return (
    <EmbeddedReadyPage
      configuration={configuration}
      hostBridge={hostBridge}
      colorPalette={colorPalette}
    />
  );
}

function EmbeddedReadyPage({
  configuration,
  hostBridge,
  colorPalette,
}: {
  configuration: EmbeddedScreenConfiguration;
  hostBridge: EmbeddedHostBridge;
  colorPalette: styles.colors.ColorPalette;
}) {
  const authenticationClient = useAuthenticationClient();
  const authenticationState =
    useEmbeddedAuthenticationState(authenticationClient);
  const hostState = useEmbeddedHostState(hostBridge);
  const session = useEmbeddedReviewSession(
    configuration,
    hostBridge,
    hostState,
    authenticationClient,
    authenticationState,
  );
  const pageItems = useMemo(() => {
    const tasks = new Map(session.tasks.map((task) => [task.id, task]));
    const seeds = hostState
      ? hostState.orderedScreenRecords.flatMap(
          (record) => record?.reviewItems ?? [],
        )
      : configuration.reviewItems;
    return seeds.flatMap((seed) => {
      const task = tasks.get(seed.taskID);
      return task ? [{ task, componentID: seed.componentID }] : [];
    });
  }, [configuration, hostState, session.tasks]);

  return (
    <EmbeddedReviewView
      key={authenticationState.userRecord?.userID ?? "anonymous"}
      configuration={configuration}
      colorPalette={colorPalette}
      authenticationState={authenticationState}
      hostState={hostState}
      session={session}
      pageItems={pageItems}
    />
  );
}

function EmbeddedReviewView({
  configuration,
  colorPalette,
  authenticationState,
  hostState,
  session,
  pageItems,
}: {
  configuration: EmbeddedScreenConfiguration;
  colorPalette: styles.colors.ColorPalette;
  authenticationState: EmbeddedAuthenticationState;
  hostState: EmbeddedHostState | null;
  session: ReturnType<typeof useEmbeddedReviewSession>;
  pageItems: ReviewItem[];
}) {
  const didInitializeSession = useRef(false);
  const hasMarked = useRef(false);
  const markInFlight = useRef(false);
  const unfinishedMark = useRef<{
    record: ReviewAreaMarkingRecord;
    requestID: string;
  } | null>(null);
  const [isSaving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const initialReviewItems = useRef(pageItems);

  const reviewSessionManager = useReviewSessionManager();

  useEffect(() => {
    if (!didInitializeSession.current) {
      didInitializeSession.current = true;
      const ownItems = initialReviewItems.current.filter((item) =>
        configuration.reviewItems.some(
          (seed) =>
            seed.taskID === item.task.id &&
            seed.componentID === item.componentID,
        ),
      );
      reviewSessionManager.updateSessionItems(() => initialReviewItems.current);
      const uncollectedItems = ownItems.filter(
        (item) =>
          item.task.componentStates[item.componentID]
            ?.lastRepetitionTimestampMillis == null,
      );
      reviewSessionManager.pushReviewAreaQueueItems(
        getEmbeddedReviewAreaItemsFromReviewItems(
          uncollectedItems.length > 0 ? uncollectedItems : ownItems,
          colorPalette,
        ),
      );
    }
  }, [colorPalette, configuration.reviewItems, reviewSessionManager]);

  const updateSessionItems = useByrefCallback((reviewItems: ReviewItem[]) => {
    reviewSessionManager.updateSessionItems(() => reviewItems);
  });
  useEffect(() => {
    updateSessionItems(pageItems);
  }, [pageItems, updateSessionItems]);
  const wasInitiallyComplete =
    !hasMarked.current &&
    reviewSessionManager.currentReviewAreaQueueIndex === 0 &&
    configuration.reviewItems.every((seed) =>
      pageItems.some(
        (item) =>
          item.task.id === seed.taskID &&
          item.componentID === seed.componentID &&
          item.task.componentStates[seed.componentID]
            ?.lastRepetitionTimestampMillis != null,
      ),
    );

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    const { currentSessionItemIndex, sessionItems } = reviewSessionManager;
    if (currentSessionItemIndex === null) {
      throw new Error("Marking without valid currentSessionItemIndex");
    }
    if (markInFlight.current) return;
    hasMarked.current = true;
    const reviewItem = sessionItems[currentSessionItemIndex];
    const finishMark = () => {
      reviewSessionManager.markCurrentItem([], (newState) => {
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
          reviewSessionManager.pushReviewAreaQueueItems(
            getEmbeddedReviewAreaItemsFromReviewItems(
              itemsToRetry,
              colorPalette,
            ),
          );
        }
      });
    };
    if (markingRecord.outcome === TaskRepetitionOutcome.Skipped) {
      finishMark();
      return;
    }

    markInFlight.current = true;
    setSaving(true);
    unfinishedMark.current ??= {
      record: markingRecord,
      requestID: generateUniqueID(),
    };
    void session
      .mark(
        reviewItem.task.id,
        reviewItem.componentID,
        markingRecord.outcome,
        unfinishedMark.current.requestID,
      )
      .then((result) => {
        if (!mounted.current) return;
        unfinishedMark.current = null;
        const acceptedTask = result.task;
        reviewSessionManager.updateSessionItems((sessionItems) =>
          sessionItems.map((item) =>
            item.task.id === acceptedTask.id
              ? { ...item, task: acceptedTask }
              : item,
          ),
        );
        // The returned projection already includes the mark; only advance here.
        finishMark();
      })
      .catch((error) => {
        console.error("Could not save embedded mark", error);
      })
      .finally(() => {
        if (!mounted.current) return;
        markInFlight.current = false;
        setSaving(false);
      });
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
              hasUncommittedActions={session.hasPendingReviews}
              isSaving={isSaving}
              isDebug={configuration.isDebug}
              wasInitiallyComplete={wasInitiallyComplete}
              getURLForAttachmentID={session.getURLForAttachmentID}
            />
          );
        }}
      </ReviewSessionContainer>
      {/* Focus can fail a background read during a press. Keep status out of
          the bottom controls without moving their layout between down/up. */}
      {(session.error || isSaving) && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            zIndex: 2,
            top: 0,
            height: styles.layout.gridUnit * 6,
            left: styles.layout.edgeMargin,
            right: styles.layout.edgeMargin,
            backgroundColor: colorPalette.backgroundColor,
            flexDirection: "row",
            alignItems: "center",
            gap: styles.layout.gridUnit,
          }}
        >
          <View pointerEvents="none" style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: styles.colors.white }}>
              {isSaving
                ? "Saving…"
                : `Orbit couldn't save or load your progress: ${session.error?.message}. Keep this page open and try again.`}
            </Text>
          </View>
          {session.error && !isSaving && (
            <button
              type="button"
              onClick={() => {
                if (unfinishedMark.current)
                  onMark(unfinishedMark.current.record);
                else void session.refresh();
              }}
            >
              Try again
            </button>
          )}
        </View>
      )}
    </View>
  );
}

export default function EmbeddedPageDataWrapper() {
  const [bridge] = useState(
    () =>
      new EmbeddedHostBridge(
        getEmbeddedScreenConfigurationFromURL(window.location.href),
      ),
  );
  const [configuration, setConfiguration] =
    useState<EmbeddedScreenConfiguration | null>(null);
  useEffect(() => {
    let disposed = false;
    void bridge.configuration().then((value) => {
      if (!disposed) setConfiguration(value);
    });
    return () => {
      disposed = true;
    };
  }, [bridge]);

  return (
    configuration && (
      <EmbeddedPage configuration={configuration} hostBridge={bridge} />
    )
  );
}
