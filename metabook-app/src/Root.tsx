import {
  MetabookDataClient,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
  MetabookPromptDataSnapshot,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "metabook-client";
import {
  decodePrompt,
  encodePrompt,
  getDuePromptIDs,
  Prompt,
  PromptSpecID,
} from "metabook-core";
import {
  PromptReviewItem,
  ReviewArea,
  ReviewAreaProps,
  ReviewItem,
} from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import "node-libs-react-native/globals";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { FileSystem } from "react-native-unimodules";
import {
  enableFirebasePersistence,
  getFirebaseApp,
  PersistenceStatus,
} from "./firebase";

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

function usePromptStates(
  userClient: MetabookUserClient,
): MetabookPromptStateSnapshot | null {
  const persistenceStatus = usePersistenceStatus();
  const [
    promptStates,
    setPromptStates,
  ] = useState<MetabookPromptStateSnapshot | null>(null);

  // TODO: surface in UI
  const subscriptionDidFail = useCallback(
    (error) => console.error("Subscription error", error),
    [],
  );

  useEffect(() => {
    if (persistenceStatus === "pending") {
      return;
    }

    console.log("Subscribing to prompt states");
    return userClient.subscribeToPromptStates(
      {},
      setPromptStates,
      subscriptionDidFail,
    );
  }, [userClient, persistenceStatus, setPromptStates, subscriptionDidFail]);

  return promptStates;
}

function usePromptSpecs(
  dataClient: MetabookDataClient,
  promptSpecIDs: Set<PromptSpecID>,
): MetabookPromptDataSnapshot | null {
  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const [
    promptSpecs,
    setPromptSpecs,
  ] = useState<MetabookPromptDataSnapshot | null>(null);

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    console.log("Fetching prompt specs", promptSpecIDs);
    const { unsubscribe } = dataClient.getData(
      promptSpecIDs,
      (newPromptSpecs) => {
        console.log("Got new prompt specs", newPromptSpecs);
        setPromptSpecs(newPromptSpecs);
      },
    );
    unsubscribeFromDataRequest.current = unsubscribe;

    return () => {
      unsubscribeFromDataRequest.current?.();
      unsubscribeFromDataRequest.current = null;
    };
  }, [dataClient, promptSpecIDs]);

  return promptSpecs;
}

function useReviewItems(
  userClient: MetabookUserClient,
  dataClient: MetabookDataClient,
): ReviewItem[] | null {
  const promptStates = usePromptStates(userClient);

  const orderedDuePrompts = useMemo(() => {
    if (promptStates === null) {
      return null;
    }

    const duePromptIDs = getDuePromptIDs({
      promptStates,
      reviewSessionIndex: 0, // TODO
      timestampMillis: Date.now(),
      cardsCompletedInCurrentSession: 0, // TODO
    });
    return duePromptIDs
      .map((promptID) => {
        const prompt = decodePrompt(promptID);
        if (prompt) {
          return prompt;
        } else {
          console.error("Can't parse prompt ID", promptID);
          return null;
        }
      })
      .filter<Prompt>((prompt: Prompt | null): prompt is Prompt => !!prompt);
  }, [promptStates]);

  const duePromptSpecIDSet: Set<PromptSpecID> = useMemo(
    () =>
      orderedDuePrompts === null
        ? new Set()
        : new Set(orderedDuePrompts.map((p) => p.promptSpecID)),
    [orderedDuePrompts],
  );

  const promptSpecs = usePromptSpecs(dataClient, duePromptSpecIDSet);

  return useMemo(() => {
    console.log("Computing review items");
    return (
      orderedDuePrompts
        ?.map((prompt): PromptReviewItem | null => {
          const promptSpec = promptSpecs?.get(prompt.promptSpecID);
          if (promptSpec) {
            if (promptSpec instanceof Error) {
              console.error(
                "Error getting prompt spec",
                prompt.promptSpecID,
                promptSpec,
              );
              // TODO surface error more effectively
              return null;
            } else {
              const promptState =
                promptStates?.get(encodePrompt(prompt)) ?? null;
              // TODO validate that prompt spec, prompt state, and prompt parameter types all match up... or, better, design the API to ensure that more reasonably
              return {
                reviewItemType: "prompt",
                promptSpec,
                promptState,
                promptParameters: prompt.promptParameters,
              } as PromptReviewItem;
            }
          } else {
            console.log("Still loading", prompt.promptSpecID);
            return null;
          }
        })
        .filter<ReviewItem>(
          (task: PromptReviewItem | null): task is PromptReviewItem => !!task,
        ) ?? null
    );
  }, [orderedDuePrompts, promptStates, promptSpecs]);
}

export default function App() {
  const [{ userClient, dataClient }] = useState(() => {
    const firebaseApp = getFirebaseApp();

    return {
      userClient: new MetabookFirebaseUserClient(firebaseApp, "testID"),
      dataClient: new MetabookFirebaseDataClient(firebaseApp),
    };
  });

  const items = useReviewItems(userClient, dataClient);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      console.log("Recording update");
      const { commit } = userClient.recordAction({
        actionOutcome: marking.outcome,
        basePromptState: marking.reviewItem.promptState,
        sessionID: null,
        timestampMillis: Date.now(),
        promptSpec: marking.reviewItem.promptSpec,
        promptTaskParameters:
          marking.reviewItem.promptState?.taskParameters ?? null,
        promptParameters: marking.reviewItem.promptParameters,
      });

      commit
        .then(() => {
          console.log("Committed", marking.reviewItem.promptSpec);
        })
        .catch((error) => {
          console.error(
            "Couldn't commit",
            marking.reviewItem.promptSpec,
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
