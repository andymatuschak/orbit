import {
  defaultSpacedRepetitionSchedulerConfiguration,
  generateUniqueID,
  ReviewItem,
  TaskID,
  TaskRepetitionOutcome,
  type ObservationID,
  type AttachmentID,
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
import { Platform, Text, View, type ViewInstance } from "react-native";
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
import {
  getReviewIntervalAfterOutcome,
  getTaskAfterReview,
  itemIsStillDue,
  type ReviewMutation,
} from "./scheduling.js";
import {
  observeReviewQueue,
  type ReviewQueueState,
} from "./observeReviewQueue.js";
import { ReviewSubmission, type ReviewSaveState } from "./reviewSubmission.js";

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
}): ReviewMutation {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const id = generateUniqueID();
  const mutation: ReviewMutation = {
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

function useReviewItemQueue(database: ReviewDatabase | null): ReviewQueueState {
  const [state, setState] = useState<ReviewQueueState>({
    queue: null,
    error: null,
  });
  useEffect(() => {
    setState({ queue: null, error: null });
    if (!database) return;
    return observeReviewQueue(database, setState);
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
  const buttonRef = useRef<ViewInstance | null>(null);
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
  const pendingWrites = useRef(0);
  const submissions = useRef<ReviewSubmission | null>(null);
  const [reviewSaveState, setReviewSaveState] = useState<ReviewSaveState>({
    failedCount: 0,
    isRetrying: false,
  });
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
  // Keep pre-rendered cards' Markdown/attachments memoized while only the
  // current card and its answer visibility change.
  const getURLForAttachmentID = React.useCallback(
    (id: AttachmentID) => database!.getURLForAttachmentID(id),
    [database],
  );
  const weakDatabase = useWeakRef(database);
  const { queue: initialQueue, error: queueError } =
    useReviewItemQueue(database);
  const appUpdates = useAppUpdateMenuItem(
    () =>
      pendingWrites.current === 0 && !submissions.current?.hasUnsavedReviews,
  );
  const appUpdateMenuItem = appUpdates.menuItem;
  const displayedItem =
    currentReviewAreaQueueIndex === null
      ? undefined
      : reviewAreaQueue[currentReviewAreaQueueIndex];
  const displayedCardIdentity = `${currentReviewAreaQueueIndex}\0${displayedItem?.taskID}\0${displayedItem?.componentID}`;
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
  const reviewSubmissions = (submissions.current ??= new ReviewSubmission(
    setReviewSaveState,
    (mutation) => {
      const database = weakDatabase.current;
      const version = submissions.current?.savedTaskVersion(mutation.taskID);
      if (!database || version === undefined) return;
      // Reconcile the saved task off the response path. A late result must not
      // mark the successor or overwrite a newer preview for this same task.
      void database.getTaskProjections([mutation.taskID]).then(
        ({ tasks }) => {
          if (
            weakDatabase.current !== database ||
            submissions.current?.savedTaskVersion(mutation.taskID) !== version
          )
            return;
          const task = tasks.get(mutation.taskID);
          if (task) weakReviewSessionManager.current.refreshTask(task);
        },
        (error) =>
          console.error("Review saved, but could not refresh its task", error),
      );
    },
  ));
  reviewSubmissions.showCard(displayedCardIdentity);
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
    return database!.apply(mutations).finally(() => {
      pendingWrites.current--;
      appUpdates.writesFinished();
    });
  }

  function retryFailedReviews() {
    void reviewSubmissions.retryFailed(
      (mutation) => commit([mutation]),
      () => appUpdates.writesFinished(),
    );
  }

  function onMark(markingRecord: ReviewAreaMarkingRecord) {
    const responseStartedAt = performance.now();
    if (currentSessionItemIndex === null) {
      throw new Error("onMark called with no valid current item index");
    }
    const reviewItem = sessionItems[currentSessionItemIndex];
    // A second callback from the departing card must not record another review.
    // This guard belongs to that displayed card, not to the ongoing save: the
    // next card remains usable while earlier commands finish in the background.
    if (
      !reviewSubmissions.canSubmit(displayedCardIdentity) ||
      markingRecord.reviewAreaItem.taskID !== reviewItem.task.id ||
      markingRecord.reviewAreaItem.componentID !== reviewItem.componentID
    )
      return;
    const mutation = createReviewMutation({
      reviewItem,
      outcome: markingRecord.outcome,
      reviewSessionStartTimestampMillis:
        reviewSessionStartTimestampMillis.current,
    });
    const preview = getTaskAfterReview(
      reviewItem,
      database!.scheduler,
      mutation,
    );
    const preparedAt = performance.now();
    void reviewSubmissions.submit(
      displayedCardIdentity,
      mutation,
      () => {
        reviewSessionManager.markCurrentItem(preview, mutation.componentID);
        requestAnimationFrame(() => {
          console.log("[Performance] Review response", {
            preparationMillis: preparedAt - responseStartedAt,
            responseMillis: performance.now() - responseStartedAt,
          });
        });
      },
      (mutation) => commit([mutation]),
      () => appUpdates.writesFinished(),
    );
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
    const undoItem = reviewSessionManager.topUndoItem;
    if (!undoItem) return;
    const undoMutations = undoItem.getUndoMutations();
    reviewSessionManager.undo();
    commit(undoMutations).catch((error) => {
      console.error("Couldn't commit undo events", error);
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

  const saveFailureNotice = reviewSaveState.failedCount ? (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: styles.layout.gridUnit,
        marginBottom: styles.layout.gridUnit,
        backgroundColor: currentColorPalette.secondaryBackgroundColor,
      }}
    >
      <Text
        accessibilityRole="alert"
        style={[styles.type.runningTextSmall.layoutStyle, { flex: 1 }]}
      >
        {reviewSaveState.failedCount === 1
          ? "One review hasn’t been saved. "
          : `${reviewSaveState.failedCount} reviews haven’t been saved. `}
        Keep Orbit open and retry.
      </Text>
      <Button
        size="small"
        title={reviewSaveState.isRetrying ? "Retrying…" : "Retry"}
        disabled={reviewSaveState.isRetrying}
        onPress={retryFailedReviews}
      />
    </View>
  ) : null;

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
              {saveFailureNotice}
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
                  previewIntervalMillis={
                    pendingOutcome === null
                      ? undefined
                      : getReviewIntervalAfterOutcome(
                          sessionItems[currentSessionItemIndex],
                          database.scheduler,
                          pendingOutcome,
                          Date.now(),
                        )
                  }
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
                getURLForAttachmentID={getURLForAttachmentID}
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
              {saveFailureNotice}
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
