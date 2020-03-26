import firebase from "firebase";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import { MetabookDataClient } from "metabook-client/dist/dataClient";
import {
  MetabookCardStateSnapshot,
  MetabookUserClient,
} from "metabook-client/dist/userClient";
import { getIDForPromptData } from "metabook-core";
import getDuePromptIDs from "metabook-core/dist/getDueCardIDs";
import { testBasicPromptData } from "metabook-sample-data";
import { ReviewArea, ReviewAreaProps, ReviewTask } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import "node-libs-react-native/globals";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  enableFirebasePersistence,
  getFirebaseApp,
  PersistenceStatus,
} from "./firebase";

function generateTask(questionText: string): ReviewTask {
  return {
    type: "question",
    cardState: null,
    promptData: { ...testBasicPromptData, question: questionText },
    promptIndex: null,
  };
}

function usePersistenceStatus() {
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(
    "pending",
  );
  enableFirebasePersistence()
    .then(() => setPersistenceStatus("enabled"))
    .catch(() => setPersistenceStatus("unavailable"));

  return persistenceStatus;
}

function useTasks(
  userClient: MetabookUserClient,
  dataClient: MetabookDataClient,
) {
  const [tasks, setTasks] = useState<ReviewTask[]>([]);

  const persistenceStatus = usePersistenceStatus();

  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const cardStatesDidChange = useCallback(
    (newCardStates: MetabookCardStateSnapshot) => {
      // TODO transform to tasks
      const duePromptIDs = getDuePromptIDs({
        cardStates: newCardStates,
        reviewSessionIndex: 0, // TODO
        timestampMillis: Date.now(),
        cardsCompletedInCurrentSession: 0, // TODO
      });

      unsubscribeFromDataRequest.current?.();
      const { completion, unsubscribe } = dataClient.getData(
        new Set(duePromptIDs),
        (snapshot) => {
          setTasks(
            duePromptIDs
              .map((id): ReviewTask | null => {
                const promptData = snapshot[id];
                if (promptData) {
                  if (promptData instanceof Error) {
                    console.error("Error getting prompt", id, promptData);
                    // TODO surface error more effectively
                    return null;
                  } else {
                    if (promptData.cardType === "basic") {
                      return {
                        type: "question",
                        promptData,
                        promptIndex: null,
                        cardState: newCardStates[id] ?? null,
                      };
                    } else {
                      return {
                        type: "question",
                        promptData,
                        promptIndex: 0, // TODO
                        cardState: newCardStates[id] ?? null,
                      };
                    }
                  }
                } else {
                  return null;
                }
              })
              .filter<ReviewTask>(
                (task: ReviewTask | null): task is ReviewTask => !!task,
              ),
          );
        },
      );
      unsubscribeFromDataRequest.current = unsubscribe;
    },
    [setTasks],
  );
  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    unsubscribeFromDataRequest.current = null;
  }, []);

  const subscriptionDidFail = useCallback(
    (error) => console.error("Subscription error", error),
    [],
  );

  useEffect(() => {
    if (persistenceStatus === "pending") {
      return;
    }

    console.log("subscribing to user card states");
    return userClient.subscribeToCardStates(
      {},
      cardStatesDidChange,
      subscriptionDidFail,
    );
  }, [userClient, persistenceStatus]);
  return tasks;
}

function recordTestTasks(dataClient: MetabookDataClient) {
  const initialTasks: ReviewTask[] = Array.from(new Array(5).keys()).map((i) =>
    generateTask(`Question ${i + 1}`),
  );

  dataClient
    .recordData(initialTasks.map((t) => t.promptData))
    .then((r) => console.log("finished recording prompts", r))
    .catch((error) => console.error("Couldn't record prompts", error));
}

export default function App() {
  const [{ userClient, dataClient }] = useState(() => {
    const firebaseApp = getFirebaseApp();
    return {
      userClient: new MetabookFirebaseUserClient(firebaseApp, "testID"),
      dataClient: new MetabookFirebaseDataClient(firebaseApp),
    };
  });

  const tasks = useTasks(userClient, dataClient);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      const promptID = getIDForPromptData(marking.task.promptData);
      console.log("Recording update");
      const { newCardState, commit } = userClient.recordCardStateUpdate({
        actionOutcome: marking.outcome,
        baseCardState: null,
        promptID,
        promptType: marking.task.promptData.cardType,
        sessionID: null,
        timestamp: Date.now(),
      });

      commit
        .then(() => {
          console.log("Committed", promptID);
        })
        .catch((error) => {
          console.error("Couldn't commit", promptID, error);
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
      <ReviewArea
        tasks={tasks}
        onMark={onMark}
        schedule="aggressiveStart"
        shouldLabelApplicationPrompts={false}
        onLogin={() => {
          return;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0",
    alignItems: "center",
    justifyContent: "center",
  },
});
