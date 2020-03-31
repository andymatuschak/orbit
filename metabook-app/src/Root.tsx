import {
  getIDForPromptTask,
  MetabookDataClient,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
  MetabookUserClient,
} from "metabook-client";
import {
  EncodedPromptID,
  encodePromptID,
  getDuePromptIDs,
  PromptState,
} from "metabook-core";
import { ReviewArea, ReviewAreaProps, ReviewTask } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import "node-libs-react-native/globals";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  enableFirebasePersistence,
  getFirebaseApp,
  PersistenceStatus,
} from "./firebase";

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
  const promptStatesDidChange = useCallback(
    (newPromptStates: ReadonlyMap<EncodedPromptID, PromptState>) => {
      // TODO transform to tasks
      const duePromptIDs = getDuePromptIDs({
        promptStates: newPromptStates,
        reviewSessionIndex: 0, // TODO
        timestampMillis: Date.now(),
        cardsCompletedInCurrentSession: 0, // TODO
      });

      unsubscribeFromDataRequest.current?.();
      const { unsubscribe } = dataClient.getData(
        new Set(duePromptIDs.map((promptID) => promptID.promptSpecID)),
        (snapshot) => {
          setTasks(
            duePromptIDs
              .map((promptID): ReviewTask | null => {
                const promptSpec = snapshot.get(promptID.promptSpecID);
                if (promptSpec) {
                  if (promptSpec instanceof Error) {
                    console.error("Error getting prompt", promptID, promptSpec);
                    // TODO surface error more effectively
                    return null;
                  } else {
                    const promptState =
                      newPromptStates.get(encodePromptID(promptID)) ?? null;
                    switch (promptSpec.promptSpecType) {
                      case "basic":
                        return {
                          type: "prompt",
                          promptTask: {
                            spec: promptSpec,
                          },
                          promptState,
                        };
                      case "applicationPrompt":
                        return {
                          type: "prompt",
                          promptTask: {
                            spec: promptSpec,
                            variantIndex: 0, // TODO: will likely need to move this into client or something; depends on prior action task ID
                          },
                          promptState,
                        };
                      case "cloze":
                        if (promptID.childIndex === null) {
                          console.warn(
                            `Warning: user has a prompt state for cloze prompt group spec ID ${promptID.promptSpecID} without a child index`,
                          );
                        }
                        return {
                          type: "prompt",
                          promptTask: {
                            spec: promptSpec,
                            clozeIndex: promptID.childIndex ?? 0,
                          },
                          promptState,
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
    [setTasks, dataClient],
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
    return userClient.subscribeToPromptStates(
      {},
      promptStatesDidChange,
      subscriptionDidFail,
    );
  }, [
    userClient,
    persistenceStatus,
    promptStatesDidChange,
    subscriptionDidFail,
  ]);
  return tasks;
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
      console.log("Recording update");
      const { commit } = userClient.recordAction({
        actionOutcome: marking.outcome,
        basePromptState: marking.reviewTask.promptState,
        sessionID: null,
        timestampMillis: Date.now(),
        promptTaskID: getIDForPromptTask(marking.reviewTask.promptTask),
      });

      commit
        .then(() => {
          console.log("Committed", marking.reviewTask.promptTask.spec);
        })
        .catch((error) => {
          console.error(
            "Couldn't commit",
            marking.reviewTask.promptTask.spec,
            error,
          );
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
