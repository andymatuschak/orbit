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
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { getFirebaseApp } from "./firebase";
import { useReviewItems } from "./useReviewItems";

async function cacheWriteHandler(
  name: string,
  extension: string,
  data: Buffer,
): Promise<string> {
  const cacheDirectoryURI = FileSystem.cacheDirectory;
  if (cacheDirectoryURI === null) {
    throw new Error("Unknown cache directory");
  }
  const cachedAttachmentURI = cacheDirectoryURI + name + "." + extension;
  await FileSystem.writeAsStringAsync(
    cachedAttachmentURI,
    base64.fromByteArray(Uint8Array.from(data)),
    { encoding: "base64" },
  );
  console.log(`Wrote file to cache: ${cachedAttachmentURI}`);
  return cachedAttachmentURI;
}

export default function App() {
  const [{ userClient, dataClient }] = useState(() => {
    const firebaseApp = getFirebaseApp();

    return {
      userClient: new MetabookFirebaseUserClient(
        firebaseApp.firestore(),
        "testID",
      ),
      dataClient: new MetabookFirebaseDataClient(
        firebaseApp,
        firebaseApp.functions(),
        cacheWriteHandler,
      ),
    };
  });

  const items = useReviewItems(userClient, dataClient);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      console.log("Recording update");

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
        })
        .catch((error) => {
          console.error("Couldn't commit", marking.reviewItem.prompt, error);
        });
    },
    [userClient],
  );

  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        backgroundColor: colors.key00,
      }}
    >
      {items && (
        <ReviewArea
          items={items}
          onMark={onMark}
          schedule="aggressiveStart"
          shouldLabelApplicationPrompts={false}
          onLogin={() => {
            return;
          }}
        />
      )}
    </View>
  );
}
