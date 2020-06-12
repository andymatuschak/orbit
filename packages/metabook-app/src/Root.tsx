import base64 from "base64-js";
import * as FileSystem from "expo-file-system";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
  Authentication,
} from "metabook-client";
import colors from "metabook-ui/dist/styles/colors";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import ActionLogStore from "./model/actionLogStore";
import DataRecordClient from "./model/dataRecordClient";
import DataRecordStore from "./model/dataRecordStore";
import PromptStateClient from "./model/promptStateClient";
import PromptStateStore from "./model/promptStateStore";
import ReviewSession from "./ReviewSession";
import SignInScreen from "./SignInScreen";
import {
  enableFirebasePersistence,
  getFirebaseAuth,
  getFirebaseFunctions,
  getFirestore,
  PersistenceStatus,
} from "./util/firebase";

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

// undefined means we don't know yet; null means signed out.
function useCurrentUserRecord(
  authenticationClient: Authentication.AuthenticationClient,
): Authentication.UserRecord | null | undefined {
  const [userID, setUserID] = useState<
    Authentication.UserRecord | null | undefined
  >(undefined);
  useEffect(() => {
    return authenticationClient.subscribeToUserAuthState(setUserID);
  }, [authenticationClient]);
  return userID;
}

export default function Root() {
  const persistenceStatus = usePersistenceStatus();
  const [
    promptStateClient,
    setPromptStateClient,
  ] = useState<PromptStateClient | null>(null);
  const [
    dataRecordClient,
    setDataRecordClient,
  ] = useState<DataRecordClient | null>(null);

  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  const userRecord = useCurrentUserRecord(authenticationClient);

  useEffect(() => {
    if (persistenceStatus === "enabled" && userRecord) {
      const userClient = new MetabookFirebaseUserClient(
        getFirestore(),
        userRecord.userID,
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
  }, [persistenceStatus, userRecord]);

  if (promptStateClient && dataRecordClient) {
    return (
      <ReviewSession
        promptStateClient={promptStateClient}
        dataRecordClient={dataRecordClient}
      />
    );
  } else if (userRecord === null) {
    return <SignInScreen authenticationClient={authenticationClient} />;
  } else {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.key50} />
      </View>
    );
  }
}
