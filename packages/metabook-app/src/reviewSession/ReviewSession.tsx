import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  ActionLogID,
  getIDForActionLogSync,
  getIDForPromptSync,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptActionLog,
  PromptProvenanceType,
  PromptRepetitionOutcome,
  PromptTask,
  promptTypeSupportsRetry,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import {
  ReviewArea,
  ReviewAreaItem,
  ReviewAreaMarkingRecord,
  ReviewStarburst,
  styles,
  useWeakRef,
} from "metabook-ui";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRecord } from "../authentication";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../authentication/authContext";
import DatabaseManager from "../model/databaseManager";
import { ReviewSessionContainer } from "../ReviewSessionContainer";
import { useReviewSessionManager } from "../reviewSessionManager";
import {
  getAttachmentUploader,
  getFirebaseFunctions,
  getFirestore,
} from "../util/firebase";

export function useDatabaseManager(
  userRecord: UserRecord | null | undefined,
): DatabaseManager | null {
  const [
    databaseManager,
    setDatabaseManager,
  ] = useState<DatabaseManager | null>(null);

  // Close the database on unmount.
  useEffect(() => {
    return () => {
      databaseManager?.close();
    };
  }, [databaseManager]);

  // Once we're signed in, create the database manager.
  useEffect(() => {
    if (userRecord) {
      const userClient = new MetabookFirebaseUserClient(
        getFirestore(),
        userRecord.userID,
      );
      const dataClient = new MetabookFirebaseDataClient(
        getFirebaseFunctions(),
        getAttachmentUploader(),
      );
      setDatabaseManager(new DatabaseManager(userClient, dataClient));
    }
  }, [userRecord]);

  return databaseManager;
}

function persistMarking({
  databaseManager,
  reviewItem,
  outcome,
  reviewSessionStartTimestampMillis,
}: {
  databaseManager: DatabaseManager;
  reviewItem: ReviewItem;
  outcome: PromptRepetitionOutcome;
  reviewSessionStartTimestampMillis: number;
}): { log: PromptActionLog; id: ActionLogID }[] {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const promptActionLog = {
    actionLogType: repetitionActionLogType,
    parentActionLogIDs: reviewItem.promptState?.headActionLogIDs ?? [],
    taskID: getIDForPromptTask({
      promptID: getIDForPromptSync(reviewItem.prompt),
      promptType: reviewItem.prompt.promptType,
      promptParameters: reviewItem.promptParameters,
    } as PromptTask),
    outcome: outcome,
    context: `review/${Platform.OS}/${reviewSessionStartTimestampMillis}`,
    timestampMillis: Date.now(),
    taskParameters: getNextTaskParameters(
      reviewItem.prompt,
      reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
  } as const;

  databaseManager
    .recordPromptActionLogs([promptActionLog])
    .then(() => {
      console.log("[Performance] Log committed to server", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", reviewItem.prompt, error);
    });

  return [{ log: promptActionLog, id: getIDForActionLogSync(promptActionLog) }];
}

function useReviewItemQueue(
  databaseManager: DatabaseManager | null,
): ReviewItem[] | null {
  const [queue, setQueue] = useState<ReviewItem[] | null>(null);
  useEffect(() => {
    if (!databaseManager) return;

    let isCanceled = false;
    databaseManager.fetchReviewQueue().then((queue) => {
      if (isCanceled) return;
      setQueue(queue);
    });
    return () => {
      isCanceled = true;
    };
  }, [databaseManager]);

  return queue;
}

export function getColorPaletteForReviewItem(
  reviewItem: ReviewItem,
): styles.colors.ColorPalette {
  if (reviewItem.promptState) {
    const provenance = reviewItem.promptState.taskMetadata.provenance;
    if (
      provenance &&
      provenance.provenanceType === PromptProvenanceType.Web &&
      provenance.colorPaletteName &&
      styles.colors.palettes[provenance.colorPaletteName]
    ) {
      return styles.colors.palettes[provenance.colorPaletteName];
    }
  }

  const colorNames = styles.colors.orderedPaletteNames;
  const colorName =
    colorNames[
      (reviewItem.promptState?.lastReviewTimestampMillis ?? 0) %
        colorNames.length
    ];
  return styles.colors.palettes[colorName];
}

function getReviewAreaItemsFromReviewItems(
  reviewItems: ReviewItem[],
): ReviewAreaItem[] {
  return reviewItems.map((item) => ({
    prompt: item.prompt,
    promptParameters: item.promptParameters,
    taskParameters: getNextTaskParameters(
      item.prompt,
      item.promptState?.lastReviewTaskParameters ?? null,
    ),
    provenance: item.promptState?.taskMetadata.provenance ?? null,
    attachmentResolutionMap: item.attachmentResolutionMap,
    colorPalette: getColorPaletteForReviewItem(item),
  }));
}

export default function ReviewSession() {
  const insets = useSafeAreaInsets();
  const reviewSessionStartTimestampMillis = useRef(Date.now());

  const [
    pendingOutcome,
    setPendingOutcome,
  ] = useState<PromptRepetitionOutcome | null>(null);

  const {
    sessionItems,
    currentSessionItemIndex,
    reviewAreaQueue,
    currentReviewAreaQueueIndex,
    ...reviewSessionManager
  } = useReviewSessionManager();

  const userRecord = useCurrentUserRecord(useAuthenticationClient());
  const databaseManager = useDatabaseManager(userRecord);
  const initialQueue = useReviewItemQueue(databaseManager);

  // When the initial queue becomes available, add it to the review session manager.
  const weakReviewSessionManager = useWeakRef(reviewSessionManager);
  useEffect(() => {
    if (initialQueue !== null) {
      weakReviewSessionManager.current.updateSessionItems(() => initialQueue);
      weakReviewSessionManager.current.pushReviewAreaQueueItems(
        getReviewAreaItemsFromReviewItems(initialQueue),
      );
    }
  }, [initialQueue, weakReviewSessionManager]);

  if (initialQueue === null) {
    // TODO: display loading screen...
    return null;
  }

  const currentColorPalette =
    currentReviewAreaQueueIndex !== null &&
    reviewAreaQueue[currentReviewAreaQueueIndex]
      ? reviewAreaQueue[currentReviewAreaQueueIndex].colorPalette
      : styles.colors.palettes.red;

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    if (currentSessionItemIndex === null) {
      throw new Error("onMark called with no valid current item index");
    }
    const logs = persistMarking({
      databaseManager: databaseManager!,
      reviewItem: sessionItems[currentSessionItemIndex],
      outcome: markingRecord.outcome,
      reviewSessionStartTimestampMillis:
        reviewSessionStartTimestampMillis.current,
    });
    reviewSessionManager.markCurrentItem(logs);
  }

  return (
    <ReviewSessionContainer
      insets={{ top: insets.top }}
      colorPalette={currentColorPalette}
    >
      {({ containerSize }) => {
        if (
          currentReviewAreaQueueIndex !== null &&
          currentSessionItemIndex !== null &&
          currentReviewAreaQueueIndex < reviewAreaQueue.length
        ) {
          return (
            <>
              <ReviewStarburst
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                items={sessionItems.map((item, index) => ({
                  promptState: item.promptState,
                  // TODO: update for retry
                  isPendingForSession: index >= currentReviewAreaQueueIndex,
                  supportsRetry: promptTypeSupportsRetry(
                    item.prompt.promptType,
                  ),
                }))}
                currentItemIndex={currentSessionItemIndex}
                pendingOutcome={pendingOutcome}
                position="left"
                showLegend={true}
                colorMode="bicolor"
                colorPalette={currentColorPalette}
              />
              <ReviewArea
                items={reviewAreaQueue}
                currentItemIndex={currentReviewAreaQueueIndex}
                onMark={(markingRecord) => onMark(markingRecord)}
                onPendingOutcomeChange={setPendingOutcome}
                insetBottom={
                  // So long as the container isn't tall enough to be centered, we consume the bottom insets in the button bar's padding, extending the background down through the safe area.
                  containerSize.height === styles.layout.maximumContentHeight
                    ? 0
                    : insets.bottom ?? 0
                }
              />
            </>
          );
        } else {
          return (
            <View
              style={{
                marginLeft: styles.layout.gridUnit,
                marginRight: styles.layout.gridUnit,
                flex: 1,
                justifyContent: "center",
              }}
            >
              <Text
                style={styles.type.headline.layoutStyle}
              >{`All caught up!\nNothing's due for review.`}</Text>
            </View>
          );
        }
      }}
    </ReviewSessionContainer>
  );
}
