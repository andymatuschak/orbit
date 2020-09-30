import "firebase/functions";
import {
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  ingestActionLogType,
  PromptActionLog,
  PromptProvenanceType,
  PromptRepetitionOutcome,
  PromptTask,
  repetitionActionLogType,
  ActionLogID,
  PromptID,
  applicationPromptType,
  promptTypeSupportsRetry,
  PromptState,
} from "metabook-core";
import {
  ReviewArea,
  ReviewAreaMarkingRecord,
  ReviewItem,
  ReviewStarburst,
  styles,
  useLayout,
  useTransitioningValue,
} from "metabook-ui";
import FadeView from "metabook-ui/dist/components/FadeView";
import { getColorPaletteForReviewItem } from "metabook-ui/dist/reviewItem";
import { ColorPalette } from "metabook-ui/dist/styles/colors";
import { getWidthSizeClass } from "metabook-ui/dist/styles/layout";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Animated, Text, View } from "react-native";
import { ReviewSessionWrapper } from "../ReviewSessionWrapper";
import { useAuthenticationClient } from "../util/authContext";
import { getFirebaseFunctions } from "../util/firebase";
import EmbeddedBanner from "./EmbeddedBanner";
import {
  EmbeddedHostState,
  embeddedHostUpdateEventName,
  EmbeddedScreenConfiguration,
  EmbeddedScreenState,
  embeddedScreenStateUpdateEventName,
  getEmbeddedColorPalette,
  getEmbeddedScreenConfigurationFromURL,
} from "./embeddedScreenConfiguration";
import OnboardingModalWeb from "./OnboardingModal.web";
import useDecodedReviewItems from "./useDecodedReviewItems";
import {
  EmbeddedAuthenticationState,
  useEmbeddedAuthenticationState,
} from "./useEmbeddedAuthenticationState";
import getAttachmentURLsByIDInReviewItem from "./util/getAttachmentURLsByIDInReviewItem";

async function recordMarking(
  authenticationState: EmbeddedAuthenticationState,
  configuration: EmbeddedScreenConfiguration,
  marking: ReviewAreaMarkingRecord,
): Promise<{ log: PromptActionLog; id: ActionLogID }[]> {
  if (authenticationState.status === "storageRestricted") {
    // TODO: probably only do this on Firefox--Safari's UI is awful
    authenticationState.onRequestStorageAccess();
  }

  const promptID = await getIDForPrompt(marking.reviewItem.prompt);
  const taskID = getIDForPromptTask({
    promptType: marking.reviewItem.prompt.promptType,
    promptID,
    promptParameters: marking.reviewItem.promptParameters,
  } as PromptTask);

  const logs: { log: PromptActionLog; id: ActionLogID }[] = [];
  const markingTimestampMillis = Date.now();
  if (!marking.reviewItem.promptState) {
    const ingestLog: PromptActionLog = {
      actionLogType: ingestActionLogType,
      taskID,
      timestampMillis: markingTimestampMillis,
      provenance: {
        provenanceType: PromptProvenanceType.Web,
        title: configuration.embeddedHostMetadata.title,
        url: configuration.embeddedHostMetadata.url,
        externalID: configuration.embeddedHostMetadata.url,
        modificationTimestampMillis: null,
        colorPaletteName: configuration.embeddedHostMetadata.colorPaletteName,
        siteName: configuration.embeddedHostMetadata.siteName,
      },
    };
    logs.push({ log: ingestLog, id: await getIDForActionLog(ingestLog) });
  }

  const repetitionLog: PromptActionLog = {
    actionLogType: repetitionActionLogType,
    taskID,
    parentActionLogIDs: logs[0]
      ? [logs[0].id]
      : marking.reviewItem.promptState?.headActionLogIDs ?? [],
    taskParameters: getNextTaskParameters(
      marking.reviewItem.prompt,
      marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
    outcome: marking.outcome,
    context: null, // TODO
    timestampMillis: markingTimestampMillis,
  };
  logs.push({
    log: repetitionLog,
    id: await getIDForActionLog(repetitionLog),
  });

  if (authenticationState.userRecord) {
    const prompt = marking.reviewItem.prompt;

    getFirebaseFunctions()
      .httpsCallable("recordEmbeddedActions")({
        logs: logs.map(({ log }) => log),
        promptsByID: { [promptID]: prompt },
        attachmentURLsByID: getAttachmentURLsByIDInReviewItem(
          marking.reviewItem.prompt,
          marking.reviewItem.attachmentResolutionMap,
        ),
      })
      .then(() => console.log("Recorded action"))
      .catch((error) => console.error(error));
  }

  return logs;
}

function useHostStateNotifier(items: ReviewItem[]) {
  useEffect(() => {
    let isInvalidated = false;

    Promise.all(items.map((item) => getIDForPrompt(item.prompt))).then(
      (promptIDs) => {
        if (isInvalidated) {
          return;
        }
        const state: EmbeddedScreenState = {
          orderedPromptIDs: promptIDs,
          orderedPromptStates: items.map(({ promptState }) => promptState),
        };

        parent.postMessage(
          { type: embeddedScreenStateUpdateEventName, state },
          "*",
        );
      },
    );

    return () => {
      isInvalidated = true;
    };
  }, [items]);
}

function flatten<T>(array: T[][]): T[] {
  return array.reduce((current, output) => output.concat(current), []);
}

function getStarburstMergedPageState(
  localItems: ReviewItem[],
  hostState: EmbeddedHostState | null,
): { itemStates: (PromptState | null)[]; localItemIndexOffset: number } {
  if (hostState) {
    const localIndex = hostState.receiverIndex;
    const priorItems = flatten(
      hostState.orderedScreenStates
        .slice(0, localIndex)
        .map((screenState) => screenState?.orderedPromptStates ?? []),
    );
    const laterItems = flatten(
      hostState.orderedScreenStates
        .slice(localIndex + 1)
        .map((screenState) => screenState?.orderedPromptStates ?? []),
    );
    return {
      itemStates: [
        ...priorItems,
        ...localItems.map((i) => i.promptState),
        ...laterItems,
      ],
      localItemIndexOffset: priorItems.length,
    };
  } else {
    return {
      itemStates: localItems.map((i) => i.promptState),
      localItemIndexOffset: 0,
    };
  }
}

interface EmbeddedScreenRendererProps {
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  items: ReviewItem[];
  currentItemIndex: number;
  containerWidth: number;
  containerHeight: number;
  authenticationState: EmbeddedAuthenticationState;
  colorPalette: ColorPalette;
  hostState: EmbeddedHostState | null;
}
function EmbeddedScreenRenderer({
  onMark,
  currentItemIndex,
  items,
  containerWidth,
  containerHeight,
  authenticationState,
  colorPalette,
  hostState,
}: EmbeddedScreenRendererProps) {
  useHostStateNotifier(items);

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

  if (currentItemIndex >= items.length && !isComplete) {
    setTimeout(() => setComplete(true), 350);
    setTimeout(() => {
      // There are bugs with RNW's implementation of delay with spring animations, alas.
      if (authenticationState.status !== "signedIn") {
        setShouldShowOnboardingModal(true);
      }
    }, 750);
  }

  const starburstMergedPageState = useMemo(
    () => getStarburstMergedPageState(items, hostState),
    [items, hostState],
  );
  const cappedLocalItemIndex = Math.min(currentItemIndex, items.length - 1);
  const starburstItemIndex =
    cappedLocalItemIndex + starburstMergedPageState.localItemIndexOffset;

  return (
    <>
      <EmbeddedBanner
        palette={colorPalette}
        isSignedIn={authenticationState.status === "signedIn"}
        totalPromptCount={items.length}
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
          itemStates={starburstMergedPageState.itemStates}
          currentItemIndex={starburstItemIndex}
          currentItemSupportsRetry={promptTypeSupportsRetry(
            items[cappedLocalItemIndex].prompt.promptType,
          )}
          pendingOutcome={pendingOutcome}
          position={isComplete ? "center" : "left"}
          showLegend={
            currentItemIndex <
            items.length /* animate out the legend a little early */
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
            {items.length} prompts collected
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
          overrideColorPalette={colorPalette}
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
}

function useHostStateListener() {
  const [hostState, setHostState] = useState<EmbeddedHostState | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.source === parent &&
        event.data &&
        event.data.type === embeddedHostUpdateEventName
      ) {
        console.log("Got new host state", event.data.state);
        setHostState(event.data.state);
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return hostState;
}

export default function EmbeddedScreen() {
  const [configuration] = useState(
    getEmbeddedScreenConfigurationFromURL(window.location.href),
  );
  const hostState = useHostStateListener();
  const colorPalette = getEmbeddedColorPalette(configuration);

  const baseItems = useDecodedReviewItems(configuration.embeddedItems);

  const authenticationClient = useAuthenticationClient();
  const authenticationState = useEmbeddedAuthenticationState(
    authenticationClient,
  );

  const onMark = useCallback(
    (marking: ReviewAreaMarkingRecord) =>
      recordMarking(authenticationState, configuration, marking),
    [authenticationState, configuration],
  );

  if (baseItems === null) {
    return null;
  }

  return (
    <View style={{ height: "100vh" }}>
      <ReviewSessionWrapper
        baseItems={baseItems}
        onMark={onMark}
        overrideColorPalette={colorPalette}
      >
        {(args) => (
          <EmbeddedScreenRenderer
            {...args}
            authenticationState={authenticationState}
            colorPalette={colorPalette}
            hostState={hostState}
          />
        )}
      </ReviewSessionWrapper>
    </View>
  );
}
