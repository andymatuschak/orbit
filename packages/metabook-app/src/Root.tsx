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
import { cardWidth } from "metabook-ui/dist/components/Card";
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
import {
  Animated,
  Platform,
  SafeAreaView,
  SafeAreaViewComponent,
  StyleSheet,
  Text,
  View,
  ViewComponent,
} from "react-native";
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

const progressBarStyles = StyleSheet.create({
  common: {
    position: "absolute",
    height: gridUnit * 3,
    top: 0,
    flexDirection: "row",
  },
  mac: {
    left: 100,
    top: 1, // hack: counteracting the safe area
    right: spacing.spacing06,
  },
  compact: {
    width: cardWidth,
  },
});

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
      style={[
        progressBarStyles.common,
        Platform.OS === "ios" && Platform.isPad
          ? progressBarStyles.mac
          : progressBarStyles.compact,
      ]} // TODO should be Catalyst-specific
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
      <Spacer size={spacing.spacing06} />
      <View
        style={{
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: colors.key70,
            fontSize: 20,
            textAlign: "right",
            fontWeight: "600",
          }}
        >
          {props.totalTaskCount - props.completedTaskCount}
        </Text>
      </View>
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
      const userClient = new MetabookFirebaseUserClient(getFirestore(), "demo");
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

  // TODO: implement real queue
  const [maxItemCount, setMaxItemCount] = useState(0);
  useEffect(() => {
    setMaxItemCount((maxItemCount) =>
      Math.max(maxItemCount, items?.length ?? 0),
    );
  }, [items]);

  const onMarkCallback = useCallback<ReviewAreaProps["onMark"]>(
    (marking) => {
      onMark(promptStateClient, marking);
    },
    [promptStateClient],
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
    items ? (
      items.length > 0 ? (
        <View style={{ flex: 1, alignItems: "center" }}>
          <ReviewArea
            items={items}
            onMark={onMarkCallback}
            schedule="aggressiveStart"
            shouldLabelApplicationPrompts={false}
          />
          <ProgressBar
            completedTaskCount={maxItemCount - items.length}
            totalTaskCount={maxItemCount}
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
