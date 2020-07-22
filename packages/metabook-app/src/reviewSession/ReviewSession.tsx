import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewArea, ReviewAreaProps, ReviewItem } from "metabook-ui";
import { ReviewAreaMarkingRecord } from "metabook-ui/dist/components/ReviewArea";
import colors from "metabook-ui/dist/styles/colors";
import { spacing } from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, SafeAreaView, Text, View } from "react-native";
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
import ReviewSessionProgressBar from "./ReviewSessionProgressBar";
import { UserRecord } from "../authentication";

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
) {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  databaseManager
    .recordPromptActionLogs([
      {
        actionLogType: repetitionActionLogType,
        parentActionLogIDs:
          marking.reviewItem.promptState?.headActionLogIDs ?? [],
        taskID: getIDForPromptTask({
          promptID: getIDForPrompt(marking.reviewItem.prompt),
          promptType: marking.reviewItem.prompt.promptType,
          promptParameters: marking.reviewItem.promptParameters,
        } as PromptTask),
        outcome: marking.outcome,
        context: null, // TODO
        timestampMillis: Date.now(),
        taskParameters: getNextTaskParameters(
          marking.reviewItem.prompt,
          marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
        ),
      },
    ])
    .then(() => {
      console.log("[Performance] Log committed to server", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", marking.reviewItem.prompt, error);
    });
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

  const remainingItems = useMemo(() => items?.slice(currentQueueIndex), [
    items,
    currentQueueIndex,
  ]);

  const onMarkCallback = useCallback<ReviewAreaProps["onMark"]>(
    (marking) => {
      onMark(databaseManager!, marking);
      setCurrentQueueIndex((currentQueueIndex) => currentQueueIndex + 1);
    },
    [databaseManager],
  );

  console.log("[Performance] Render", Date.now() / 1000.0);

  const outerViewComponent =
    Platform.OS === "ios" && Platform.isPad ? View : SafeAreaView; // TODO: Catalyst hack
  return React.createElement(
    outerViewComponent,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        backgroundColor: colors.key00,
      },
    },
    remainingItems ? (
      remainingItems.length > 0 ? (
        <View style={{ flex: 1, alignItems: "center" }}>
          <ReviewArea
            items={remainingItems}
            onMark={onMarkCallback}
            schedule="aggressiveStart"
          />
          <ReviewSessionProgressBar
            completedTaskCount={currentQueueIndex}
            totalTaskCount={items!.length}
          />
        </View>
      ) : (
        <Text
          style={{
            textAlign: "center",
            ...typography.cardBodyText,
            color: colors.key70,
            opacity: 0.4,
            fontSize: 24,
            lineHeight: 24 * 1.5,
            marginLeft: spacing.spacing05,
            marginRight: spacing.spacing05,
          }}
        >{`All caught up!\nNothing's due for review.`}</Text>
      )
    ) : null,
  );
}
