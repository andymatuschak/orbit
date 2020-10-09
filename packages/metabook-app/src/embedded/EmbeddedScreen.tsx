import "firebase/functions";
import {
  ActionLogID,
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  ingestActionLogType,
  Prompt,
  PromptActionLog,
  PromptProvenanceType,
  PromptRepetitionOutcome,
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
  ReviewStarburstItem,
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
import {
  ReviewSessionWrapper,
  ReviewSessionWrapperProps,
} from "../ReviewSessionWrapper";
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

type PromptActionLogEntry = { log: PromptActionLog; id: ActionLogID };

interface EmbeddedActionsRecord {
  logEntries: PromptActionLogEntry[];
  promptsByID: { [key: string]: Prompt };
  attachmentURLsByID: { [key: string]: string };
}

async function getMarkingLogs(
  configuration: EmbeddedScreenConfiguration,
  marking: ReviewAreaMarkingRecord,
  sessionStartTimestampMillis: number,
): Promise<EmbeddedActionsRecord> {
  const promptID = await getIDForPrompt(marking.reviewItem.prompt);
  const taskID = getIDForPromptTask({
    promptType: marking.reviewItem.prompt.promptType,
    promptID,
    promptParameters: marking.reviewItem.promptParameters,
  } as PromptTask);

  const logEntries: { log: PromptActionLog; id: ActionLogID }[] = [];
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
    logEntries.push({ log: ingestLog, id: await getIDForActionLog(ingestLog) });
  }

  const repetitionLog: PromptActionLog = {
    actionLogType: repetitionActionLogType,
    taskID,
    parentActionLogIDs: logEntries[0]
      ? [logEntries[0].id]
      : marking.reviewItem.promptState?.headActionLogIDs ?? [],
    taskParameters: getNextTaskParameters(
      marking.reviewItem.prompt,
      marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
    outcome: marking.outcome,
    context: `embedded/${sessionStartTimestampMillis}`,
    timestampMillis: markingTimestampMillis,
  };
  logEntries.push({
    log: repetitionLog,
    id: await getIDForActionLog(repetitionLog),
  });

  return {
    logEntries,
    promptsByID: { [promptID]: marking.reviewItem.prompt },
    attachmentURLsByID: getAttachmentURLsByIDInReviewItem(
      marking.reviewItem.prompt,
      marking.reviewItem.attachmentResolutionMap,
    ),
  };
}

function mergePendingActionsRecords(
  a: EmbeddedActionsRecord,
  b: EmbeddedActionsRecord,
): EmbeddedActionsRecord {
  return {
    logEntries: [...a.logEntries, ...b.logEntries],
    promptsByID: { ...a.promptsByID, ...b.promptsByID },
    attachmentURLsByID: { ...a.attachmentURLsByID, ...b.attachmentURLsByID },
  };
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

function getStarburstItemsForScreenState(
  screenState: EmbeddedScreenState,
): ReviewStarburstItem[] {
  return screenState.orderedPromptStates.map((promptState) => ({
    promptState,
    isPendingForSession: !promptState,
    supportsRetry: false,
  }));
}

function getPageState(
  localItems: ReviewItem[],
  hostState: EmbeddedHostState | null,
): { starburstItems: ReviewStarburstItem[]; localItemIndexOffset: number } {
  const localStarburstItems: ReviewStarburstItem[] = localItems.map((item) => ({
    promptState: item.promptState,
    isPendingForSession: !item.promptState,
    supportsRetry: promptTypeSupportsRetry(item.prompt.promptType),
  }));
  if (hostState) {
    const localIndex = hostState.receiverIndex;
    const priorItems = flatten(
      hostState.orderedScreenStates
        .slice(0, localIndex)
        .map((screenState) =>
          screenState ? getStarburstItemsForScreenState(screenState) : [],
        ),
    );
    const laterItems = flatten(
      hostState.orderedScreenStates
        .slice(localIndex + 1)
        .map((screenState) =>
          screenState ? getStarburstItemsForScreenState(screenState) : [],
        ),
    );
    return {
      starburstItems: [...priorItems, ...localStarburstItems, ...laterItems],
      localItemIndexOffset: priorItems.length,
    };
  } else {
    return {
      starburstItems: localStarburstItems,
      localItemIndexOffset: 0,
    };
  }
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
  onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
  items: ReviewItem[];
  baseItems: ReviewItem[];
  currentItemIndex: number;
  containerWidth: number;
  containerHeight: number;
  authenticationState: EmbeddedAuthenticationState;
  colorPalette: styles.colors.ColorPalette;
  hostState: EmbeddedHostState | null;
  hasUncommittedActions: boolean;
}
function EmbeddedScreenRenderer({
  onMark,
  currentItemIndex,
  baseItems,
  items,
  containerWidth,
  containerHeight,
  authenticationState,
  colorPalette,
  hostState,
  hasUncommittedActions,
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
          items={pageState.starburstItems}
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
            {getEndOfTaskLabel(pageState.starburstItems, !!hostState)}
          </Text>
        </FadeView>
        <FadeView
          isVisible={
            /* TODO: show this after saving is actually complete */
            isComplete && !hasUncommittedActions
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
          items={baseItems}
          currentItemIndex={currentItemIndex}
          onMark={onMark}
          onPendingOutcomeChange={setPendingOutcome}
          insetBottom={0}
          overrideColorPalette={colorPalette}
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
              sizeClass={styles.layout.getWidthSizeClass(containerWidth)}
            />
          </Animated.View>
        </>
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

async function submitPendingActionsRecord(
  actionsRecord: EmbeddedActionsRecord,
): Promise<unknown> {
  return getFirebaseFunctions().httpsCallable("recordEmbeddedActions")({
    logs: actionsRecord.logEntries.map(({ log }) => log),
    promptsByID: actionsRecord.promptsByID,
    attachmentURLsByID: actionsRecord.attachmentURLsByID,
  });
}

function useMarkingManager(
  authenticationState: EmbeddedAuthenticationState,
  configuration: EmbeddedScreenConfiguration,
): {
  onMark: ReviewSessionWrapperProps["onMark"];
  hasUncommittedActions: boolean;
} {
  const reviewSessionStartTimestampMillis = useRef(Date.now());
  const [
    pendingActionsRecord,
    setPendingActionsRecord,
  ] = useState<EmbeddedActionsRecord | null>(null);
  const onMark: ReviewSessionWrapperProps["onMark"] = useCallback(
    async (marking) => {
      const newRecord = await getMarkingLogs(
        configuration,
        marking,
        reviewSessionStartTimestampMillis.current,
      );
      setPendingActionsRecord((pendingActionsRecord) =>
        pendingActionsRecord
          ? mergePendingActionsRecords(pendingActionsRecord, newRecord)
          : newRecord,
      );
      return newRecord.logEntries;
    },
    [configuration],
  );

  useEffect(() => {
    if (!pendingActionsRecord) {
      return;
    }
    if (authenticationState.status === "signedIn") {
      submitPendingActionsRecord(pendingActionsRecord)
        .then(() => {
          console.log("Saved actions to server", pendingActionsRecord);
          setPendingActionsRecord(null);
        })
        .catch((error) => {
          console.error(
            `Failed to save record: ${error.message}`,
            pendingActionsRecord,
          );
        });
    } else {
      console.log(
        "Queueing actions for after user authenticates",
        pendingActionsRecord,
      );
    }
  }, [pendingActionsRecord, authenticationState]);

  return { onMark, hasUncommittedActions: !!pendingActionsRecord };
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

  const { onMark, hasUncommittedActions } = useMarkingManager(
    authenticationState,
    configuration,
  );

  if (baseItems === null) {
    return null; // TODO show loading screen: we may be downloading attachments.
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
            hasUncommittedActions={hasUncommittedActions}
          />
        )}
      </ReviewSessionWrapper>
    </View>
  );
}
