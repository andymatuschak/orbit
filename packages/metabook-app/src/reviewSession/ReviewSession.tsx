import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptActionLog,
  PromptRepetitionOutcome,
  PromptTask,
  repetitionActionLogType,
  ActionLogID,
  getIDForActionLog,
} from "metabook-core";
import {
  ReviewArea,
  ReviewItem,
  ReviewStarburst,
  styles,
  ReviewAreaMarkingRecord,
} from "metabook-ui";
import { layout } from "metabook-ui/dist/styles";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserRecord } from "../authentication";
import DatabaseManager from "../model/databaseManager";
import { ReviewSessionWrapper } from "../ReviewSessionWrapper";
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

// Returned promise resolves when the prompt action log has been generated, not when it has committed to the server.
async function updateDatabaseForMarking(
  databaseManager: DatabaseManager,
  marking: ReviewAreaMarkingRecord,
): Promise<{ log: PromptActionLog; id: ActionLogID }[]> {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  const promptActionLog = {
    actionLogType: repetitionActionLogType,
    parentActionLogIDs: marking.reviewItem.promptState?.headActionLogIDs ?? [],
    taskID: getIDForPromptTask({
      promptID: await getIDForPrompt(marking.reviewItem.prompt),
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

  return [
    { log: promptActionLog, id: await getIDForActionLog(promptActionLog) },
  ];
}

function useReviewQueue(
  databaseManager: DatabaseManager | null,
): ReviewItem[] | null {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
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

  return items;
}

export default function ReviewSession() {
  const userRecord = useCurrentUserRecord(useAuthenticationClient());
  const databaseManager = useDatabaseManager(userRecord);
  const baseItems = useReviewQueue(databaseManager);
  const insets = useSafeAreaInsets();

  const [
    pendingOutcome,
    setPendingOutcome,
  ] = useState<PromptRepetitionOutcome | null>(null);

  return baseItems !== null ? (
    <View style={{ flex: 1 }}>
      <ReviewSessionWrapper
        baseItems={baseItems}
        onMark={(markingRecord) =>
          updateDatabaseForMarking(databaseManager!, markingRecord)
        }
        insets={{ top: insets.top }}
        overrideColorPalette={
          baseItems.length > 0 ? undefined : styles.colors.palettes.red
        }
      >
        {({
          onMark,
          currentItemIndex,
          items,
          containerWidth,
          containerHeight,
        }) => {
          if (currentItemIndex < items.length) {
            return (
              <>
                <ReviewStarburst
                  containerWidth={containerWidth}
                  containerHeight={containerHeight}
                  items={items}
                  currentItemIndex={currentItemIndex}
                  pendingOutcome={pendingOutcome}
                  position="left"
                  showLegend={true}
                  colorMode="bicolor"
                />
                <ReviewArea
                  items={items}
                  currentItemIndex={currentItemIndex}
                  onMark={onMark}
                  onPendingOutcomeChange={setPendingOutcome}
                  insetBottom={
                    // So long as the container isn't tall enough to be centered, we consume the bottom insets in the button bar's padding, extending the background down through the safe area.
                    containerHeight === layout.maximumContentHeight
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
                  marginLeft: styles.layout.gridUnit, // TODO: use grid layout
                  marginRight: styles.layout.gridUnit,
                }}
              >
                <Text
                  style={styles.type.headline.layoutStyle}
                >{`All caught up!\nNothing's due for review.`}</Text>
              </View>
            );
          }
        }}
      </ReviewSessionWrapper>
    </View>
  ) : null;
}
