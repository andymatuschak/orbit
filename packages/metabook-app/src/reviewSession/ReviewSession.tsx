import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  applyActionLogToPromptState,
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptActionLog,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import {
  Headline,
  ReviewArea,
  ReviewAreaProps,
  ReviewItem,
  styles,
  useTransitioningValue,
} from "metabook-ui";
import { ReviewAreaMarkingRecord } from "metabook-ui/dist/components/ReviewArea";
import React, { useCallback, useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRecord } from "../authentication";
import DatabaseManager from "../model/databaseManager";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../util/authContext";
import {
  enableFirebasePersistence,
  getAttachmentUploader,
  getFirebaseFunctions,
  getFirestore,
  PersistenceStatus,
} from "../util/firebase";

function usePersistenceStatus() {
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(
    "pending",
  );

  useEffect(() => {
    let hasUnmounted = false;

    function safeSetPersistenceStatus(newStatus: PersistenceStatus) {
      if (!hasUnmounted) {
        setPersistenceStatus(newStatus);
      }
    }

    enableFirebasePersistence()
      .then(() => safeSetPersistenceStatus("enabled"))
      .catch(() => safeSetPersistenceStatus("unavailable"));

    return () => {
      hasUnmounted = true;
    };
  }, []);

  return persistenceStatus;
}

export function useDatabaseManager(
  userRecord: UserRecord | null | undefined,
): DatabaseManager | null {
  const persistenceStatus = usePersistenceStatus();

  const [
    databaseManager,
    setDatabaseManager,
  ] = useState<DatabaseManager | null>(null);
  useEffect(() => {
    return () => {
      databaseManager?.close();
    };
  }, [databaseManager]);

  useEffect(() => {
    if (persistenceStatus === "enabled" && userRecord) {
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
  }, [persistenceStatus, userRecord]);

  return databaseManager;
}

function onMark(
  databaseManager: DatabaseManager,
  marking: ReviewAreaMarkingRecord,
): PromptActionLog {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const promptActionLog = {
    actionLogType: repetitionActionLogType,
    parentActionLogIDs: marking.reviewItem.promptState?.headActionLogIDs ?? [],
    taskID: getIDForPromptTask({
      promptID: getIDForPrompt(marking.reviewItem.prompt),
      promptType: marking.reviewItem.prompt.promptType,
      promptParameters: marking.reviewItem.promptParameters,
    } as PromptTask),
    outcome: marking.outcome,
    context: null, // TODO https://github.com/andymatuschak/metabook/issues/59
    timestampMillis: Date.now(),
    taskParameters: getNextTaskParameters(
      marking.reviewItem.prompt,
      marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
  } as const;
  databaseManager
    .recordPromptActionLogs([promptActionLog])
    .then(() => {
      console.log("[Performance] Log committed to server", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", marking.reviewItem.prompt, error);
    });

  return promptActionLog;
}

export default function ReviewSession() {
  const userRecord = useCurrentUserRecord(useAuthenticationClient());
  const databaseManager = useDatabaseManager(userRecord);

  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  useEffect(() => {
    if (!databaseManager) return;

    let isCanceled = false;
    databaseManager.fetchReviewQueue().then((items) => {
      if (isCanceled) return;
      setItems(items);
    });
    return () => {
      isCanceled = true;
    };
  }, [databaseManager]);

  const topItem = items?.[currentQueueIndex];
  const colorCompositionAnimatedIndex = useTransitioningValue({
    // TODO: this is extremely silly; refactor
    value: topItem
      ? styles.colors.palettes.findIndex(
          (c) => c.backgroundColor === topItem.backgroundColor,
        )
      : 0,
    timing: {
      type: "timing",
      useNativeDriver: false,
      duration: 80,
      easing: Easing.linear,
    },
  });
  const backgroundColor = colorCompositionAnimatedIndex.interpolate({
    inputRange: Array.from(new Array(styles.colors.palettes.length).keys()),
    outputRange: styles.colors.palettes.map((c) => c.backgroundColor),
  });

  const onMarkCallback = useCallback<ReviewAreaProps["onMark"]>(
    (marking) => {
      const log = onMark(databaseManager!, marking);
      setItems((items) => {
        const markedIndex = items!.indexOf(marking.reviewItem);
        if (markedIndex === -1) {
          throw new Error("Marked item which is not in items list");
        }
        const newItems = [...items!];
        const newPromptState = applyActionLogToPromptState({
          promptActionLog: log,
          basePromptState: marking.reviewItem.promptState,
          schedule: "default",
        });
        if (newPromptState instanceof Error) {
          throw newPromptState;
        }
        newItems[markedIndex] = {
          ...newItems[markedIndex],
          promptState: newPromptState,
        };
        return newItems;
      });
      setCurrentQueueIndex((currentQueueIndex) => currentQueueIndex + 1);
    },
    [databaseManager],
  );

  console.log("[Performance] Render", Date.now() / 1000.0);

  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor,
      }}
    >
      {items ? (
        currentQueueIndex < items.length ? (
          <View style={{ flex: 1 }}>
            {/*<View style={[StyleSheet.absoluteFill, { top: insets.top }]}>*/}
            {/*  <DebugGrid shouldShowMajorDivisions />*/}
            {/*</View>*/}
            <ReviewArea
              items={items}
              currentItemIndex={currentQueueIndex}
              onMark={onMarkCallback}
              schedule="aggressiveStart"
              safeInsets={insets}
            />
          </View>
        ) : (
          <View
            style={{
              marginLeft: styles.layout.gridUnit, // TODO: use grid layout
              marginRight: styles.layout.gridUnit,
            }}
          >
            <Headline>{`All caught up!\nNothing's due for review.`}</Headline>
          </View>
        )
      ) : null}
    </Animated.View>
  );
}
