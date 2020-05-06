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
import {
  ReviewArea,
  ReviewAreaProps,
  useTransitioningValue,
} from "metabook-ui";
import { ReviewAreaMarkingRecord } from "metabook-ui/dist/components/ReviewArea";
import Spacer from "metabook-ui/dist/components/Spacer";
import colors from "metabook-ui/dist/styles/colors";
import {
  borderRadius,
  gridUnit,
  spacing,
} from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";
import "node-libs-react-native/globals";
import React, { useCallback, useEffect, useState } from "react";
import { Animated, Text, View } from "react-native";
import {
  enableFirebasePersistence,
  getFirebaseFunctions,
  getFirestore,
  PersistenceStatus,
} from "./firebase";
import ActionLogStore from "./model/actionLogStore";
import DataRecordClient from "./model/dataRecordClient";
import DataRecordStore from "./model/dataRecordStore";
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

function onMark(
  promptStateClient: PromptStateClient | null,
  marking: ReviewAreaMarkingRecord,
) {
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
            marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
          ),
        },
      },
    ])
    .then(() => {
      console.log("[Performance] Log committed to server", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", marking.reviewItem.prompt, error);
    });
}

function ProgressBar(props: {
  completedTaskCount: number;
  totalTaskCount: number;
}) {
  const progressWidth = useTransitioningValue({
    value: props.completedTaskCount,
    timing: {
      type: "spring",
      bounciness: 0,
    },
    useNativeDriver: false,
  });

  return (
    <View
      style={{
        position: "absolute",
        height: gridUnit * 3,
        top: 1,
        left: 100,
        right: 0,
        flexDirection: "row",
      }}
    >
      <View
        style={{
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            backgroundColor: colors.key10,
            height: 15,
            width: "100%",
            borderRadius: borderRadius,
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            backgroundColor: colors.key70,
            height: 15,
            width: progressWidth.interpolate({
              inputRange: [0, props.totalTaskCount],
              outputRange: ["0%", "100%"],
            }),
            borderRadius: borderRadius,
          }}
        />
      </View>
      <Spacer size={spacing.spacing04} />
      <View
        style={{
          minWidth: gridUnit * 2,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            flexShrink: 0,
            color: colors.key70,
            fontSize: 20,
            fontWeight: "600",
          }}
        >
          {props.totalTaskCount - props.completedTaskCount}
        </Text>
      </View>
      <Spacer size={spacing.spacing05} />
    </View>
  );
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

  const [completedTaskCount, setCompletedTaskCount] = useState(0);

  const onMarkCallback = useCallback<ReviewAreaProps["onMark"]>(
    (marking) => {
      setCompletedTaskCount((p) => p + 1);
      onMark(promptStateClient, marking);
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
      {items ? (
        items.length > 0 ? (
          <>
            <ReviewArea
              items={items}
              onMark={onMarkCallback}
              schedule="aggressiveStart"
              shouldLabelApplicationPrompts={false}
            />
            <ProgressBar
              completedTaskCount={completedTaskCount}
              totalTaskCount={items.length}
            />
          </>
        ) : (
          <Text
            style={{
              textAlign: "center",
              ...typography.cardBodyText,
              color: colors.key70,
              opacity: 0.4,
              fontSize: 24,
              lineHeight: 24 * 1.5,
            }}
          >{`All caught up!\nNothing's due for review at the moment.`}</Text>
        )
      ) : null}
    </View>
  );
}
