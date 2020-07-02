import {
  Authentication,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import colors from "metabook-ui/dist/styles/colors";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import DatabaseManager from "./model/databaseManager";
import ReviewSession from "./ReviewSession";
import SignInScreen from "./SignInScreen";
import {
  enableFirebasePersistence,
  getAttachmentUploader,
  getFirebaseAuth,
  getFirebaseFunctions,
  getFirestore,
  PersistenceStatus,
} from "./util/firebase";

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

function useDatabaseManager(
  userRecord: Authentication.UserRecord | null | undefined,
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

export default function Root() {
  const [authenticationClient] = useState(
    () => new Authentication.FirebaseAuthenticationClient(getFirebaseAuth()),
  );
  const userRecord = useCurrentUserRecord(authenticationClient);

  const databaseManager = useDatabaseManager(userRecord);
  if (databaseManager) {
    return <ReviewSession databaseManager={databaseManager} />;
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
