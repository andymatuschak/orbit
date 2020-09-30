import "firebase/functions";
import {
  ActionLogID,
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  ingestActionLogType,
  PromptActionLog,
  PromptProvenanceType,
  PromptRepetitionOutcome,
  PromptState,
  PromptTask,
  promptTypeSupportsRetry,
  repetitionActionLogType,
} from "metabook-core";
import {
  FadeView,
  ReviewArea,
  ReviewAreaMarkingRecord,
  ReviewItem,
  ReviewStarburst,
  styles,
  useLayout,
  useTransitioningValue,
} from "metabook-ui";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  sessionStartTimestampMillis: number,
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
    context: `embedded/${sessionStartTimestampMillis}`,
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

// Pass the local prompt states along to the hosting web page when they change (i.e. so that the starbursts in other review areas on this page reflect this one's progress).
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

function getPageState(
  localItems: ReviewItem[],
  hostState: EmbeddedHostState | null,
): { pageItemStates: (PromptState | null)[]; localItemIndexOffset: number } {
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
      pageItemStates: [
        ...priorItems,
        ...localItems.map((i) => i.promptState),
        ...laterItems,
      ],
      localItemIndexOffset: priorItems.length,
    };
  } else {
    return {
      pageItemStates: localItems.map((i) => i.promptState),
      localItemIndexOffset: 0,
    };
  }
}

function getEndOfTaskLabel(
  pageItemStates: (PromptState | null)[],
  hasPeerStates: boolean,
): string {
  const promptString = pageItemStates.length > 1 ? "prompts" : "prompt";
  if (hasPeerStates) {
    const collectedCount = pageItemStates.filter((state) => !!state).length;
    return `${collectedCount} of ${pageItemStates.length} prompts on page collected`;
  } else {
    return `${pageItemStates.length} ${promptString} collected`;
  }
}

interface EmbeddedScreenRendererProps {
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  items: ReviewItem[];
  currentItemIndex: number;
  containerWidth: number;
  containerHeight: number;
  authenticationState: EmbeddedAuthenticationState;
  colorPalette: styles.colors.ColorPalette;
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

  const pageState = useMemo(() => getPageState(items, hostState), [
    items,
    hostState,
  ]);
  const cappedLocalItemIndex = Math.min(currentItemIndex, items.length - 1);
  const starburstItemIndex =
    cappedLocalItemIndex + pageState.localItemIndexOffset;

  return (
    <>
      <EmbeddedBanner
        palette={colorPalette}
        isSignedIn={authenticationState.status === "signedIn"}
        totalPromptCount={items.length}
        completePromptCount={currentItemIndex}
        sizeClass={styles.layout.getWidthSizeClass(containerWidth)}
      />
      <Animated.View
        onLayout={onInteriorLayout}
        style={{ transform: [{ translateY: interiorY }] }}
      >
        <ReviewStarburst
          containerWidth={containerWidth}
          containerHeight={containerHeight}
          itemStates={pageState.pageItemStates}
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
            {getEndOfTaskLabel(pageState.pageItemStates, !!hostState)}
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
            sizeClass={styles.layout.getWidthSizeClass(containerWidth)}
          />
        </Animated.View>
      )}
    </>
  );
}

function useHostState() {
  const [hostState, setHostState] = useState<EmbeddedHostState | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.source === parent &&
        event.data &&
        event.data.type === embeddedHostUpdateEventName
      ) {
        // console.log("Got new host state", event.data.state);
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
  const hostState = useHostState();
  const colorPalette = getEmbeddedColorPalette(configuration);
  const baseItems = useDecodedReviewItems(configuration.embeddedItems);

  const authenticationClient = useAuthenticationClient();
  const authenticationState = useEmbeddedAuthenticationState(
    authenticationClient,
  );

  const reviewSessionStartTimestampMillis = useRef(Date.now());
  const onMark = useCallback(
    (marking: ReviewAreaMarkingRecord) =>
      recordMarking(
        authenticationState,
        configuration,
        marking,
        reviewSessionStartTimestampMillis.current,
      ),
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
