import {
  defaultSpacedRepetitionSchedulerConfiguration,
  EventForEntity,
  EventType,
  generateUniqueID,
  getReviewQueueFuzzyDueTimestampThreshold,
  ReviewItem,
  Task,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import {
  Button,
  IconName,
  Menu,
  menuItemDividerSpec,
  MenuItemSpec,
  openURL,
  ReviewArea,
  ReviewAreaItem,
  ReviewAreaMarkingRecord,
  ReviewStarburst,
  styles,
  useWeakRef,
} from "@withorbit/ui";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthenticationClient } from "../authentication/index.js";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../authentication/authContext.js";
import { DatabaseManager as DatabaseManager2 } from "../model2/databaseManager.js";
import { ReviewSessionContainer } from "../ReviewSessionContainer.js";
import { useReviewSessionManager } from "../reviewSessionManager.js";
import { useAPIClient } from "../util/useAPIClient.js";
import { LoadingScreen } from "./LoadingScreen.js";

export function useDatabaseManager(
  authenticationClient: AuthenticationClient,
): DatabaseManager2 | null {
  const [databaseManager, setDatabaseManager] =
    useState<DatabaseManager2 | null>(null);

  // Close the database on unmount.
  useEffect(() => {
    return () => {
      databaseManager?.close();
    };
  }, [databaseManager]);

  // Once we're signed in, create the database manager.
  // TODO handle switching users etc
  const userRecord = useCurrentUserRecord(authenticationClient);
  const apiClient = useAPIClient(authenticationClient);
  useEffect(() => {
    if (userRecord) {
      setDatabaseManager(new DatabaseManager2(apiClient));
    }
  }, [userRecord, apiClient]);

  return databaseManager;
}

function persistMarking({
  databaseManager,
  reviewItem,
  outcome,
  reviewSessionStartTimestampMillis,
}: {
  databaseManager: DatabaseManager2;
  reviewItem: ReviewItem;
  outcome: TaskRepetitionOutcome;
  reviewSessionStartTimestampMillis: number;
}): EventForEntity<Task>[] {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const event: TaskRepetitionEvent = {
    type: EventType.TaskRepetition,
    id: generateUniqueID(),
    entityID: reviewItem.task.id,
    reviewSessionID: `review/${Platform.OS}/${reviewSessionStartTimestampMillis}`,
    componentID: reviewItem.componentID,
    outcome: outcome,
    timestampMillis: Date.now(),
  } as const;

  databaseManager
    .recordEvents([event])
    .then(() => {
      console.log("[Performance] Log written", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", reviewItem.task.id, error);
    });

  return [event];
}

function useReviewItemQueue(
  databaseManager: DatabaseManager2 | null,
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
  const { provenance } = reviewItem.task;
  if (
    provenance?.colorPaletteName &&
    styles.colors.palettes[provenance.colorPaletteName]
  ) {
    return styles.colors.palettes[provenance.colorPaletteName];
  } else {
    const taskComponentState =
      reviewItem.task.componentStates[reviewItem.componentID];
    const colorNames = styles.colors.orderedPaletteNames;
    const colorName =
      colorNames[
        taskComponentState.createdAtTimestampMillis % colorNames.length
      ];
    return styles.colors.palettes[colorName];
  }
}

function getReviewAreaItemsFromReviewItems(
  reviewItems: ReviewItem[],
): ReviewAreaItem[] {
  return reviewItems.map((item) => ({
    taskID: item.task.id,
    spec: item.task.spec,
    componentID: item.componentID,
    provenance: item.task.provenance,
    colorPalette: getColorPaletteForReviewItem(item),
  }));
}

function ReviewMenuButton({
  colorPalette,
  items,
}: {
  colorPalette: styles.colors.ColorPalette;
  items: MenuItemSpec[];
}) {
  const buttonRef = useRef<View | null>(null);
  const [menuIsVisible, setMenuIsVisible] = useState(false);
  return (
    <View ref={buttonRef}>
      <Button
        size="small"
        alignment="right"
        color={colorPalette.accentColor}
        backgroundColor={colorPalette.secondaryBackgroundColor}
        iconName={IconName.Menu}
        accessibilityLabel="Menu"
        onPress={() => setMenuIsVisible(true)}
      />
      {buttonRef.current && (
        <Menu
          isVisible={menuIsVisible}
          targetRef={buttonRef.current}
          onClose={() => setMenuIsVisible(false)}
          colorPalette={colorPalette}
          items={items}
        />
      )}
    </View>
  );
}

export default function ReviewSession() {
  const insets = useSafeAreaInsets();
  const reviewSessionStartTimestampMillis = useRef(Date.now());

  const [pendingOutcome, setPendingOutcome] =
    useState<TaskRepetitionOutcome | null>(null);

  const {
    sessionItems,
    currentSessionItemIndex,
    reviewAreaQueue,
    currentReviewAreaQueueIndex,
    ...reviewSessionManager
  } = useReviewSessionManager();

  const authenticationClient = useAuthenticationClient();
  const databaseManager = useDatabaseManager(authenticationClient);
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
    return <LoadingScreen />;
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
    const events = persistMarking({
      databaseManager: databaseManager!,
      reviewItem: sessionItems[currentSessionItemIndex],
      outcome: markingRecord.outcome,
      reviewSessionStartTimestampMillis:
        reviewSessionStartTimestampMillis.current,
    });
    reviewSessionManager.markCurrentItem(events, (newState) => {
      // Refill queue with items to retry if we're at the end.
      if (
        newState.currentReviewAreaQueueIndex !== null &&
        newState.currentReviewAreaQueueIndex >= newState.reviewAreaQueue.length
      ) {
        const itemsToRetry = newState.sessionItems.filter(itemIsStillDue);
        if (itemsToRetry.length > 0) {
          console.log("Pushing items to retry", itemsToRetry);
          reviewSessionManager.pushReviewAreaQueueItems(
            getReviewAreaItemsFromReviewItems(itemsToRetry),
          );
        }
      }
    });
  }

  function onDelete() {
    if (currentReviewAreaQueueIndex === null) {
      throw new Error("No current review item");
    }
    reviewSessionManager.deleteCurrentItem();
    databaseManager!
      .recordEvents([
        {
          type: EventType.TaskUpdateDeleted,
          id: generateUniqueID(),
          timestampMillis: Date.now(),
          entityID: reviewAreaQueue[currentReviewAreaQueueIndex].taskID,
          isDeleted: true,
        },
      ])
      .then(() => {
        console.log("Wrote delete event", Date.now() / 1000.0);
      })
      .catch((error) => {
        console.error("Couldn't commit delete event", error);
      });
  }

  const canUndo = !!reviewSessionManager.topUndoItem;
  function onUndo() {
    reviewSessionManager.undo(({ getUndoEvents }) => {
      const undoEvents = getUndoEvents();
      if (undoEvents.length > 0) {
        databaseManager!
          .recordEvents(undoEvents)
          .then(() => {
            console.log("Wrote undo events", Date.now() / 1000.0);
          })
          .catch((error) => {
            console.error("Couldn't commit undo events", error);
          });
      }
    });
  }

  function onSkip() {
    onMark({
      reviewAreaItem: reviewAreaQueue[currentReviewAreaQueueIndex!],
      outcome: TaskRepetitionOutcome.Skipped,
    });
  }

  const canVisitPromptOrigin =
    currentSessionItemIndex !== null &&
    !!sessionItems[currentSessionItemIndex].task.provenance?.url;
  function visitPromptOrigin() {
    if (currentSessionItemIndex === null) {
      return;
    }
    const url = sessionItems[currentSessionItemIndex].task.provenance?.url;
    if (url) {
      openURL(url);
    }
  }

  return (
    <ReviewSessionContainer
      insets={{ top: insets.top }}
      colorPalette={currentColorPalette}
    >
      {({ containerSize }) => {
        if (
          databaseManager &&
          currentReviewAreaQueueIndex !== null &&
          currentSessionItemIndex !== null &&
          currentReviewAreaQueueIndex < reviewAreaQueue.length
        ) {
          return (
            <>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <ReviewStarburst
                  containerWidth={
                    // Make room for the action button
                    containerSize.width - styles.layout.gridUnit * 6
                  }
                  containerHeight={containerSize.height}
                  items={sessionItems.map((item, index) => ({
                    component: item.task.componentStates[item.componentID],
                    isPendingForSession:
                      index >= currentReviewAreaQueueIndex ||
                      itemIsStillDue(item),
                  }))}
                  currentItemIndex={currentSessionItemIndex}
                  pendingOutcome={pendingOutcome}
                  position="left"
                  showLegend={true}
                  colorMode="bicolor"
                  colorPalette={currentColorPalette}
                  config={defaultSpacedRepetitionSchedulerConfiguration}
                />
                <View
                  style={{
                    paddingTop: styles.layout.gridUnit * 2,
                    marginRight: styles.layout.gridUnit,
                  }}
                >
                  <ReviewMenuButton
                    colorPalette={currentColorPalette}
                    items={[
                      { title: "Undo", action: onUndo, disabled: !canUndo },
                      menuItemDividerSpec,
                      {
                        title: "Delete Prompt",
                        action: onDelete,
                      },
                      {
                        title: "Skip Prompt",
                        action: onSkip,
                      },
                      {
                        title: "Visit Prompt Origin",
                        action: visitPromptOrigin,
                        disabled: !canVisitPromptOrigin,
                      },
                    ]}
                  />
                </View>
              </View>
              <ReviewArea
                items={reviewAreaQueue}
                currentItemIndex={currentReviewAreaQueueIndex}
                onMark={(markingRecord) => onMark(markingRecord)}
                onPendingOutcomeChange={setPendingOutcome}
                getURLForAttachmentID={(id) =>
                  databaseManager.getURLForAttachmentID(id)
                }
                insetBottom={
                  // So long as the container isn't tall enough to be centered, we consume the bottom insets in the button bar's padding, extending the background down through the safe area.
                  containerSize.height === styles.layout.maximumContentHeight
                    ? 0
                    : insets.bottom ?? 0
                }
                sizeClass={styles.layout.getWidthSizeClass(containerSize.width)}
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

function itemIsStillDue(item: ReviewItem): boolean {
  const nowDueThreshold = getReviewQueueFuzzyDueTimestampThreshold();
  return (
    item.task.componentStates[item.componentID].dueTimestampMillis <=
    nowDueThreshold
  );
}
