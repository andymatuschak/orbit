import {
  PromptRepetitionOutcome,
  promptTypeSupportsRetry,
} from "metabook-core";
import { EmbeddedHostState } from "metabook-embedded-support";
import {
  FadeView,
  ReviewArea,
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
import { ReviewItem } from "../model/reviewItem";
import { ReviewSessionContainer } from "../ReviewSessionContainer";
import EmbeddedBanner from "./EmbeddedBanner";
import { useMarkingManager } from "./markingManager";
import OnboardingModalWeb from "./OnboardingModal.web";
import { TestModeBanner } from "./TestModeBanner";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "./useEmbeddedAuthenticationState";
import { useEmbeddedHostState } from "./useEmbeddedHostState";
import useResolvedReviewItems from "./useResolvedReviewItems";
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

interface EmbeddedScreenRendererProps {
  containerSize: { width: number; height: number };
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  localReviewItems: ReviewItem[];
  currentItemIndex: number;
  authenticationState: EmbeddedAuthenticationState;
  colorPalette: styles.colors.ColorPalette;
  hostState: EmbeddedHostState | null;
  hasUncommittedActions: boolean;
  isDebug?: boolean;
}
function EmbeddedScreenRenderer({
  onMark,
  localReviewItems,
  currentItemIndex,
  containerSize,
  authenticationState,
  colorPalette,
  hostState,
  hasUncommittedActions,
  isDebug,
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

  if (currentItemIndex >= queueItems.length && !isComplete) {
    setTimeout(() => setComplete(true), 350);
    setTimeout(() => {
      // There are bugs with RNW's implementation of delay with spring animations, alas.
      if (authenticationState.status !== "signedIn") {
        setShouldShowOnboardingModal(true);
      }
    }, 750);
  }

  const starburstItems = useMemo(() => getStarburstItems(localReviewItems), [
    localReviewItems,
  ]);

  const reviewItems = useMemo(
    () => queueItems.map(({ reviewItem }) => reviewItem),
    [queueItems],
  );

  return (
    <>
      <EmbeddedBanner
        palette={colorPalette}
        isSignedIn={authenticationState.status === "signedIn"}
        totalPromptCount={queueItems.length}
        completePromptCount={currentItemIndex}
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
          currentItemIndex={
            queueItems[Math.min(currentItemIndex, queueItems.length - 1)]
              .starburstIndex
          }
          pendingOutcome={pendingOutcome}
          position={isComplete ? "center" : "left"}
          showLegend={
            currentItemIndex <
            queueItems.length /* animate out the legend a little early */
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
          isVisible={isComplete && !hasUncommittedActions}
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
          items={reviewItems}
          currentItemIndex={currentItemIndex}
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

function computeLocalQueueItems(
  localReviewItems: ReviewItem[] | null,
  hostState: EmbeddedHostState | null,
): ReviewSessionQueueItem[] | null {
  if (!localReviewItems) {
    return null;
  }

  // How far into the page-wide item set is this particular embedded screen?
  // Sum over the size of the areas prior to this one.
  let localPageItemOffset: number;
  if (hostState) {
    localPageItemOffset = hostState?.orderedScreenRecords
      .slice(0, hostState?.receiverIndex)
      .reduce(
        (sum, screenState) => sum + (screenState?.reviewItems.length ?? 0),
        0,
      );
  } else {
    localPageItemOffset = 0;
  }

  return localReviewItems.map((reviewItem, index) => ({
    reviewItem,
    starburstIndex: index + localPageItemOffset,
  }));
}

export default function EmbeddedScreen() {
  const configuration = useRef(
    getEmbeddedScreenConfigurationFromURL(window.location.href),
  ).current;
  const colorPalette = useMemo(() => getEmbeddedColorPalette(configuration), [
    configuration,
  ]);

  const hostState = useEmbeddedHostState();
  const localReviewItems = useResolvedReviewItems(
    configuration.embeddedItems,
    colorPalette,
  );
  const localQueueItems = React.useMemo(
    () => computeLocalQueueItems(localReviewItems, hostState),
    [localReviewItems, hostState],
  );

  const authenticationClient = useAuthenticationClient();
  const authenticationState = useEmbeddedAuthenticationState(
    authenticationClient,
  );

  const {
    onMark,
    hasUncommittedActions,
    promptStates,
    currentItemIndex,
  } = useMarkingManager({
    authenticationState: authenticationState,
    configuration: configuration,
    hostPromptStates: hostState?.promptStates ?? null,
  });

  if (localQueueItems === null || localReviewItems === null) {
    return null; // TODO show loading screen: we may be resolving attachments.
  }

  return (
    <View style={{ height: "100vh", width: "100vw", overflow: "hidden" }}>
      <ReviewSessionContainer colorPalette={colorPalette}>
        {({ containerSize }) => (
          <EmbeddedScreenRenderer
            onMark={onMark}
            currentItemIndex={currentItemIndex}
            containerSize={containerSize}
            queueItems={localQueueItems}
            localReviewItems={localReviewItems}
            authenticationState={authenticationState}
            colorPalette={colorPalette}
            hostState={hostState}
            hasUncommittedActions={hasUncommittedActions}
            isDebug={configuration.isDebug}
          />
        )}
      </ReviewSessionContainer>
    </View>
  );
}
