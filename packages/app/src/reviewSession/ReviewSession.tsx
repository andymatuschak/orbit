import {
  defaultSpacedRepetitionSchedulerConfiguration,
  generateUniqueID,
  getReviewQueueFuzzyDueTimestampThreshold,
  ReviewItem,
  TaskID,
  TaskRepetitionOutcome,
  type ObservationID,
  type VaultMutation,
  type VaultMutationID,
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
  Spacer,
  styles,
  useWeakRef,
} from "../ui/index.js";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LabConnection } from "../vault/labConnection.js";
import {
  openReviewDatabase,
  type ReviewDatabase,
} from "../model2/openReviewDatabase.js";
import { ReviewSessionContainer } from "../ReviewSessionContainer.js";
import { useReviewSessionManager } from "../reviewSessionManager.js";
import { LoadingScreen } from "./LoadingScreen.js";
import useAppUpdateMenuItem from "../util/useAppUpdateMenuItem.js";

interface ReviewDatabaseState {
  localStoreID: string | null;
  database: ReviewDatabase | null;
  openError: Error | null;
}

export function useReviewDatabase(
  connection: LabConnection,
): ReviewDatabaseState & {
  retry(): void;
} {
  const [state, setState] = useState<ReviewDatabaseState>({
    localStoreID: null,
    database: null,
    openError: null,
  });
  const [openAttempt, setOpenAttempt] = useState(0);
  // Pairing selects one independent local Repo; laptop availability is not a
  // prerequisite for opening its persisted documents.
  useEffect(() => {
    let isCanceled = false;
    let openedDatabase: ReviewDatabase | null = null;
    setState({
      localStoreID: connection.localStoreID,
      database: null,
      openError: null,
    });
    void openReviewDatabase(connection).then(
      (database) => {
        if (isCanceled) {
          void database.close();
          return;
        }
        openedDatabase = database;
        setState({
          localStoreID: connection.localStoreID,
          database,
          openError: null,
        });
      },
      (error: unknown) => {
        if (isCanceled) return;
        console.error("Could not open review vault", error);
        setState({
          localStoreID: connection.localStoreID,
          database: null,
          openError: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );
    return () => {
      isCanceled = true;
      void openedDatabase?.close();
    };
  }, [connection, openAttempt]);

  const currentState =
    state.localStoreID === connection.localStoreID ? state : null;
  return {
    localStoreID: currentState?.localStoreID ?? null,
    database: currentState?.database ?? null,
    openError: currentState?.openError ?? null,
    retry: () => setOpenAttempt((value) => value + 1),
  };
}

function createReviewMutation({
  reviewItem,
  outcome,
  reviewSessionStartTimestampMillis,
}: {
  reviewItem: ReviewItem;
  outcome: TaskRepetitionOutcome;
  reviewSessionStartTimestampMillis: number;
}): Extract<VaultMutation, { kind: "recordReview" }> {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const id = generateUniqueID();
  const mutation: Extract<VaultMutation, { kind: "recordReview" }> = {
    kind: "recordReview",
    mutationID: `review/${id}` as VaultMutationID,
    observationID: `review/${id}` as ObservationID,
    taskID: reviewItem.task.id,
    reviewSessionID: `review/${Platform.OS}/${reviewSessionStartTimestampMillis}`,
    componentID: reviewItem.componentID,
    outcome,
    occurredAtTimestampMillis: Date.now(),
  };

  return mutation;
}

function useReviewItemQueue(database: ReviewDatabase | null): {
  queue: ReviewItem[] | null;
  error: Error | null;
} {
  const [state, setState] = useState<{
    queue: ReviewItem[] | null;
    error: Error | null;
  }>({ queue: null, error: null });
  useEffect(() => {
    setState({ queue: null, error: null });
    if (!database) return;

    let isCanceled = false;
    let pushedRevision = 0;
    const unsubscribe = database.subscribeToReviewQueue((queue) => {
      if (isCanceled) return;
      pushedRevision++;
      setState({ queue, error: null });
    });
    const startingRevision = pushedRevision;
    void database.fetchReviewQueue().then(
      (queue) => {
        if (isCanceled || pushedRevision !== startingRevision) return;
        setState({ queue, error: null });
      },
      (error: unknown) => {
        if (isCanceled) return;
        console.error("Could not load review queue", error);
        setState({
          queue: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );
    return () => {
      isCanceled = true;
      unsubscribe();
    };
  }, [database]);

  return state;
}

function VaultOpenErrorScreen({
  error,
  retry,
  onPairAgain,
}: {
  error: Error;
  retry(): void;
  onPairAgain(): void;
}) {
  const palette = styles.colors.palettes.red;

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: styles.layout.edgeMargin,
        backgroundColor: palette.backgroundColor,
      }}
    >
      <View style={{ width: "100%", maxWidth: 500 }}>
        <Text style={styles.type.headline.layoutStyle}>Vault unavailable</Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          {
            "Orbit Lab couldn't open its review data. Your local vault has not been replaced. If this is the first launch, connect to the laptop to download your prompts."
          }
        </Text>
        <Spacer units={2} />
        <Text style={styles.type.runningText.layoutStyle}>{error.message}</Text>
        <Spacer units={4} />
        <Button
          title="Try again"
          backgroundColor={palette.secondaryBackgroundColor}
          onPress={() => {
            retry();
          }}
        />
        <Spacer units={2} />
        <Button title="Pair again" onPress={onPairAgain} />
      </View>
    </View>
  );
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

export default function ReviewSession({
  connection,
  onPairAgain,
}: {
  connection: LabConnection;
  onPairAgain(): void;
}) {
  const insets = useSafeAreaInsets();
  const reviewSessionStartTimestampMillis = useRef(Date.now());
  const reviewWriteIsInFlight = useRef(false);
  const pendingWrites = useRef(0);
  const appUpdateMenuItem = useAppUpdateMenuItem(
    () => pendingWrites.current === 0,
  );

  const [pendingOutcome, setPendingOutcome] =
    useState<TaskRepetitionOutcome | null>(null);
  const [initialReviewReady, setInitialReviewReady] = useState(false);
  const markInitialReviewReady = React.useCallback(
    () => setInitialReviewReady(true),
    [],
  );

  const {
    sessionItems,
    currentSessionItemIndex,
    reviewAreaQueue,
    currentReviewAreaQueueIndex,
    ...reviewSessionManager
  } = useReviewSessionManager();

  const { database, openError, retry } = useReviewDatabase(connection);
  const { queue: initialQueue, error: queueError } =
    useReviewItemQueue(database);
  const hasInitialCard =
    initialQueue !== null &&
    initialQueue.length > 0 &&
    currentReviewAreaQueueIndex !== null;
  React.useEffect(() => {
    if (!hasInitialCard || initialReviewReady) return;
    const timeout = setTimeout(() => {
      // A broken attachment or renderer must not trap the review UI behind
      // its loading cover indefinitely.
      console.warn("Initial review layout did not become ready");
      setInitialReviewReady(true);
    }, 3_000);
    return () => clearTimeout(timeout);
  }, [hasInitialCard, initialReviewReady]);

  // Keep the prompt already on screen stable while remote merges replace the
  // not-yet-seen tail of the queue and append newly due work.
  const weakReviewSessionManager = useWeakRef(reviewSessionManager);
  useEffect(() => {
    if (initialQueue !== null) {
      weakReviewSessionManager.current.reconcileReviewQueue(
        initialQueue,
        getReviewAreaItemsFromReviewItems(initialQueue),
      );
    }
  }, [initialQueue, weakReviewSessionManager]);

  const searchParams = useLocalSearchParams();
  const [pendingReviewItemRequest, setPendingReviewItemRequest] = useState<{
    taskID: TaskID;
    componentID: string;
  } | null>(null);
  useEffect(() => {
    if (
      searchParams.taskID &&
      searchParams.componentID &&
      typeof searchParams.taskID === "string" &&
      typeof searchParams.componentID === "string"
    ) {
      setPendingReviewItemRequest({
        taskID: searchParams.taskID as TaskID,
        componentID: searchParams.componentID,
      });
    }
  }, [searchParams.taskID, searchParams.componentID]);
  useEffect(() => {
    if (pendingReviewItemRequest) {
      const sessionItemIndex = sessionItems.findIndex((item) => {
        return (
          item.task.id === pendingReviewItemRequest.taskID &&
          item.componentID === pendingReviewItemRequest.componentID
        );
      });
      if (sessionItemIndex >= 0) {
        setPendingReviewItemRequest(null);
        weakReviewSessionManager.current.jumpToItem(sessionItemIndex);
      }
    }
  }, [pendingReviewItemRequest, sessionItems, weakReviewSessionManager]);

  const loadError = openError ?? queueError;
  if (loadError) {
    return (
      <VaultOpenErrorScreen
        error={loadError}
        retry={retry}
        onPairAgain={onPairAgain}
      />
    );
  }

  // Reconciliation runs after the queue arrives. Keep the loading surface up
  // until the first card and its palette are selected together.
  if (
    initialQueue === null ||
    (initialQueue.length > 0 && currentReviewAreaQueueIndex === null)
  ) {
    return <LoadingScreen />;
  }

  const currentColorPalette =
    currentReviewAreaQueueIndex !== null &&
    reviewAreaQueue[currentReviewAreaQueueIndex]
      ? reviewAreaQueue[currentReviewAreaQueueIndex].colorPalette
      : styles.colors.palettes.red;

  function commit(mutations: readonly VaultMutation[]) {
    pendingWrites.current++;
    return database!.apply(mutations).finally(() => pendingWrites.current--);
  }

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    if (currentSessionItemIndex === null) {
      throw new Error("onMark called with no valid current item index");
    }
    if (reviewWriteIsInFlight.current) return;
    const reviewItem = sessionItems[currentSessionItemIndex];
    const mutation = createReviewMutation({
      reviewItem: sessionItems[currentSessionItemIndex],
      outcome: markingRecord.outcome,
      reviewSessionStartTimestampMillis:
        reviewSessionStartTimestampMillis.current,
    });
    reviewWriteIsInFlight.current = true;
    void commit([mutation])
      .then(() => {
        console.log("[Performance] Log written", Date.now() / 1000.0);
        reviewSessionManager.markCurrentItem([mutation], (newState) => {
          // Refill queue with items to retry if we're at the end.
          if (
            newState.currentReviewAreaQueueIndex !== null &&
            newState.currentReviewAreaQueueIndex >=
              newState.reviewAreaQueue.length
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
      })
      .catch((error) => {
        console.error("Couldn't commit", reviewItem.task.id, error);
      })
      .finally(() => {
        reviewWriteIsInFlight.current = false;
      });
  }

  function onDelete() {
    if (currentReviewAreaQueueIndex === null) {
      throw new Error("No current review item");
    }
    reviewSessionManager.deleteCurrentItem();
    const eventID = generateUniqueID();
    commit([
      {
        kind: "setTaskDeleted",
        mutationID: `task-delete/${eventID}` as VaultMutationID,
        taskID: reviewAreaQueue[currentReviewAreaQueueIndex].taskID,
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
    reviewSessionManager.undo(({ getUndoMutations }) => {
      const undoMutations = getUndoMutations();
      if (undoMutations.length > 0) {
        commit(undoMutations)
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
      showLoadingOverlay={initialQueue.length > 0 && !initialReviewReady}
    >
      {({ containerSize }) => {
        if (
          database &&
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
                      ...(appUpdateMenuItem
                        ? [menuItemDividerSpec, appUpdateMenuItem]
                        : []),
                    ]}
                  />
                </View>
              </View>
              <ReviewArea
                onInitialLayoutReady={markInitialReviewReady}
                items={reviewAreaQueue}
                currentItemIndex={currentReviewAreaQueueIndex}
                onMark={(markingRecord) => onMark(markingRecord)}
                onPendingOutcomeChange={setPendingOutcome}
                getURLForAttachmentID={(id) =>
                  database.getURLForAttachmentID(id)
                }
                insetBottom={
                  // So long as the container isn't tall enough to be centered, we consume the bottom insets in the button bar's padding, extending the background down through the safe area.
                  containerSize.height === styles.layout.maximumContentHeight
                    ? 0
                    : (insets.bottom ?? 0)
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
              <Text style={styles.type.headline.layoutStyle}>
                No more prompts in this session.
              </Text>
              {appUpdateMenuItem ? (
                <>
                  <Spacer units={3} />
                  <Button
                    title={appUpdateMenuItem.title}
                    disabled={appUpdateMenuItem.disabled}
                    onPress={appUpdateMenuItem.action}
                    color={currentColorPalette.accentColor}
                  />
                </>
              ) : null}
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
