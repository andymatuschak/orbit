import base64 from "base64-js";
import * as FileSystem from "expo-file-system";
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
import colors from "metabook-ui/dist/styles/colors";
import typography from "metabook-ui/dist/styles/typography";
import "node-libs-react-native/globals";
import React, { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import {
  enableFirebasePersistence,
  getFirestore,
  getFirebaseFunctions,
  PersistenceStatus,
} from "./firebase";
import ActionLogStore from "./model/actionLogStore";
import DataRecordStore from "./model/dataRecordStore";
import DataRecordClient from "./model/dataRecordClient";
import PromptStateClient from "./model/promptStateClient";
import PromptStateStore from "./model/promptStateStore";
import { useReviewItems } from "./useReviewItems";

async function cacheWriteHandler(name: string, data: Buffer): Promise<string> {
  const cacheDirectoryURI = FileSystem.cacheDirectory;
  if (cacheDirectoryURI === null) {
    throw new Error("Unknown cache directory");
  }
  const cachedAttachmentURI = cacheDirectoryURI + name;
  await FileSystem.writeAsStringAsync(
    cachedAttachmentURI,
    base64.fromByteArray(Uint8Array.from(data)),
    { encoding: "base64" },
  );
  console.log(`Wrote file to cache: ${cachedAttachmentURI}`);
  return cachedAttachmentURI;
}

async function fileExistsAtURL(url: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(url);
  return info.exists;
}

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

export default function App() {
  const persistenceStatus = usePersistenceStatus();
  const [
    promptStateClient,
    setPromptStateClient,
  ] = useState<PromptStateClient | null>(null);
  const [
    dataRecordClient,
    setDataRecordClient,
  ] = useState<DataRecordClient | null>(null);

  useEffect(() => {
    if (persistenceStatus === "enabled") {
      const userClient = new MetabookFirebaseUserClient(
        getFirestore(),
        "x5EWk2UT56URxbfrl7djoxwxiqH2",
      );
      setPromptStateClient(
        new PromptStateClient(
          userClient,
          new PromptStateStore(),
          new ActionLogStore(),
        ),
      );
      const dataClient = new MetabookFirebaseDataClient(
        getFirestore(),
        getFirebaseFunctions(),
      );
      const dataCache = new DataRecordStore();
      setDataRecordClient(
        new DataRecordClient(dataClient, dataCache, {
          writeFile: cacheWriteHandler,
          fileExistsAtURL,
        }),
      );
    }
  }, [persistenceStatus]);

  const items = useReviewItems(promptStateClient, dataRecordClient);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      console.log("[Performance] Mark prompt", Date.now() / 1000.0);

      promptStateClient!
        .recordPromptActionLogs([
          {
            log: {
              actionLogType: repetitionActionLogType,
              parentActionLogIDs:
                marking.reviewItem.promptState?.headActionLogIDs ?? [],
              taskID: getIDForPromptTask({
                promptID: getIDForPrompt(marking.reviewItem.prompt),
                promptType: marking.reviewItem.prompt.promptType,
                promptParameters: marking.reviewItem.promptParameters,
              } as PromptTask),
              outcome: marking.outcome,
              context: null,
              timestampMillis: Date.now(),
              taskParameters: getNextTaskParameters(
                marking.reviewItem.prompt,
                marking.reviewItem.promptState?.lastReviewTaskParameters ??
                  null,
              ),
            },
          },
        ])
        .then(() => {
          console.log(
            "[Performance] Log committed to server",
            Date.now() / 1000.0,
          );
        })
        .catch((error) => {
          console.error("Couldn't commit", marking.reviewItem.prompt, error);
        });
    },
    [promptStateClient],
  );

  console.log("[Performance] Render", Date.now() / 1000.0);

  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        backgroundColor: colors.key00,
      }}
    >
      {items && (
        <>
          <ReviewArea
            items={items}
            onMark={onMark}
            schedule="aggressiveStart"
            shouldLabelApplicationPrompts={false}
            onLogin={() => {
              return;
            }}
          />
          <Text
            style={{
              position: "absolute",
              right: 16,
              top: 16,
              ...typography.cardBodyText,
              color: colors.textColor,
            }}
          >{`Remaining: ${items.length}`}</Text>
        </>
      )}
    </View>
  );
}
