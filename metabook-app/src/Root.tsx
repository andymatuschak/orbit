import base64 from "base64-js";
import * as FileSystem from "expo-file-system";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getActionLogFromPromptActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewArea, ReviewAreaProps } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import "node-libs-react-native/globals";
import typography from "metabook-ui/dist/styles/typography";
import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import DataRecordCache from "./dataRecordCache";
import DataRecordClient from "./dataRecordClient";
import { getFirebaseApp } from "./firebase";
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

export default function App() {
  const [{ userClient, dataRecordClient }] = useState(() => {
    const firebaseApp = getFirebaseApp();
    const dataClient = new MetabookFirebaseDataClient(
      firebaseApp,
      firebaseApp.functions(),
    );
    const dataCache = new DataRecordCache();
    return {
      userClient: new MetabookFirebaseUserClient(
        firebaseApp.firestore(),
        "x5EWk2UT56URxbfrl7djoxwxiqH2",
      ),
      dataRecordClient: new DataRecordClient(dataClient, dataCache, {
        writeFile: cacheWriteHandler,
        fileExistsAtURL,
      }),
    };
  });

  const items = useReviewItems(userClient, dataRecordClient);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      console.log("[Performance] Mark prompt", Date.now() / 1000.0);

      userClient
        .recordActionLogs([
          getActionLogFromPromptActionLog({
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
          }),
        ])
        .then(() => {
          console.log("Committed", marking.reviewItem.prompt);
          console.log(
            "[Performance] Log committed to server",
            Date.now() / 1000.0,
          );
        })
        .catch((error) => {
          console.error("Couldn't commit", marking.reviewItem.prompt, error);
        });
    },
    [userClient],
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
