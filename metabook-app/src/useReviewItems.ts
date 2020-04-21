import {
  MetabookDataClient,
  MetabookDataSnapshot,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "metabook-client";
import {
  AttachmentID,
  AttachmentURLReference,
  getDuePromptTaskIDs,
  getPromptTaskForID,
  getIDForPromptTask,
  Prompt,
  PromptField,
  PromptID,
  PromptTask,
  QAPrompt,
} from "metabook-core";
import {
  AttachmentResolutionMap,
  PromptReviewItem,
  promptReviewItemType,
  ReviewItem,
} from "metabook-ui";
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import DataRecordClient from "./dataRecordClient";
import { enableFirebasePersistence, PersistenceStatus } from "./firebase";
import promptDataCache from "./dataRecordCache";

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
    console.log(
      "[Performance] Subscribing to prompt states",
      Date.now() / 1000.0,
    );
    return userClient.subscribeToPromptStates(
      { dueBeforeTimestampMillis: Date.now() }, // TODO: use fuzzy due dates
      setPromptStates,
      subscriptionDidFail,
    );
  }, [userClient, persistenceStatus, setPromptStates, subscriptionDidFail]);

  return promptStates;
}

function useWeakRef<T>(val: T): MutableRefObject<T> {
  const ref = useRef(val);
  useEffect(() => {
    ref.current = val;
  }, [val]);
  return ref;
}

function usePrompts(
  dataRecordClient: DataRecordClient,
  promptIDs: Set<PromptID>,
): MetabookDataSnapshot<PromptID, Prompt> | null {
  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const [prompts, setPrompts] = useState<MetabookDataSnapshot<
    PromptID,
    Prompt
  > | null>(null);
  const weakPrompts = useWeakRef(prompts);

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    let promptIDsToFetch: Set<PromptID>;
    if (weakPrompts.current) {
      promptIDsToFetch = new Set();
      for (const promptID of promptIDs) {
        if (!weakPrompts.current?.has(promptID)) {
          promptIDsToFetch.add(promptID);
        }
      }
    } else {
      promptIDsToFetch = promptIDs;
    }

    if (promptIDsToFetch.size > 0) {
      console.log("Fetching prompt specs", promptIDsToFetch);
      console.log("[Performance] Fetching prompt specs", Date.now() / 1000.0);
      let isCancelled = false;
      unsubscribeFromDataRequest.current = () => {
        isCancelled = true;
      };
      dataRecordClient.getPrompts(promptIDs).then((newPrompts) => {
        if (!isCancelled) {
          console.log(
            "[Performance] Fetched prompt specs",
            Date.now() / 1000.0,
          );
          setPrompts(
            (oldPrompts) =>
              new Map([
                ...(oldPrompts?.entries() ?? []),
                ...newPrompts.entries(),
              ]),
          );
        }
      });
    }

    return () => {
      unsubscribeFromDataRequest.current?.();
      unsubscribeFromDataRequest.current = null;
    };
  }, [weakPrompts, dataRecordClient, promptIDs]);

  return prompts;
}

function useAttachments(
  dataRecordClient: DataRecordClient,
  attachmentIDs: Set<AttachmentID>,
): MetabookDataSnapshot<AttachmentID, AttachmentURLReference> | null {
  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const [
    attachmentResolutionMap,
    setAttachmentResolutionMap,
  ] = useState<MetabookDataSnapshot<
    AttachmentID,
    AttachmentURLReference
  > | null>(null);
  const weakAttachmentResolutionMap = useWeakRef(attachmentResolutionMap);

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    let attachmentIDsToFetch: Set<AttachmentID>;
    if (weakAttachmentResolutionMap.current) {
      attachmentIDsToFetch = new Set();
      for (const promptID of attachmentIDs) {
        if (!weakAttachmentResolutionMap.current?.has(promptID)) {
          attachmentIDsToFetch.add(promptID);
        }
      }
    } else {
      attachmentIDsToFetch = attachmentIDs;
    }

    if (attachmentIDsToFetch.size > 0) {
      console.log("Fetching attachments", attachmentIDs);
      let isCancelled = false;
      unsubscribeFromDataRequest.current = () => {
        isCancelled = true;
      };
      dataRecordClient
        .getAttachments(attachmentIDs)
        .then((newAttachmentResolutionMap) => {
          if (!isCancelled) {
            console.log(
              "[Performance] Fetched attachments",
              Date.now() / 1000.0,
            );
            setAttachmentResolutionMap(
              (oldAttachmentResolutionMap) =>
                new Map([
                  ...(oldAttachmentResolutionMap?.entries() ?? []),
                  ...newAttachmentResolutionMap.entries(),
                ]),
            );
          }
        });
    }

    return () => {
      unsubscribeFromDataRequest.current?.();
      unsubscribeFromDataRequest.current = null;
    };
  }, [weakAttachmentResolutionMap, dataRecordClient, attachmentIDs]);

  return attachmentResolutionMap;
}

function getAttachmentIDsInPrompt(spec: Prompt): Set<AttachmentID> {
  const output = new Set<AttachmentID>();
  function visitQAPrompt(qaPrompt: QAPrompt) {
    function visitPromptField(promptField: PromptField) {
      promptField.attachments.forEach((attachmentIDReference) =>
        output.add(attachmentIDReference.id),
      );
    }

    visitPromptField(qaPrompt.question);
    visitPromptField(qaPrompt.answer);
    if (qaPrompt.explanation) {
      visitPromptField(qaPrompt.explanation);
    }
  }

  switch (spec.promptType) {
    case "basic":
      visitQAPrompt(spec);
      break;
    case "applicationPrompt":
      spec.variants.forEach(visitQAPrompt);
      break;
    case "cloze":
      break;
  }
  return output;
}

function getAttachmentIDsInPrompts(
  prompts: MetabookDataSnapshot<PromptID, Prompt>,
): Set<AttachmentID> {
  const output: Set<AttachmentID> = new Set();
  for (const maybeSpec of prompts.values()) {
    if (maybeSpec && !(maybeSpec instanceof Error)) {
      for (const value of getAttachmentIDsInPrompt(maybeSpec)) {
        output.add(value);
      }
    }
  }
  return output;
}

export function useReviewItems(
  userClient: MetabookUserClient,
  dataRecordClient: DataRecordClient,
): ReviewItem[] | null {
  const promptStates = usePromptStates(userClient);

  const orderedDuePromptTasks: PromptTask[] | null = useMemo(() => {
    if (promptStates === null) {
      return null;
    }

    const duePromptTaskIDs = getDuePromptTaskIDs({
      promptStates,
      reviewSessionIndex: 0, // TODO
      timestampMillis: Date.now(),
      cardsCompletedInCurrentSession: 0, // TODO
    });
    return duePromptTaskIDs
      .map((promptTaskID) => {
        const promptTask = getPromptTaskForID(promptTaskID);
        if (promptTask instanceof Error) {
          console.error("Can't parse prompt task ID", promptTaskID);
          return null;
        } else {
          return promptTask;
        }
      })
      .filter<PromptTask>(
        (promptTask: PromptTask | null): promptTask is PromptTask =>
          !!promptTask,
      );
  }, [promptStates]);

  const duePromptIDSet: Set<PromptID> = useMemo(
    () =>
      orderedDuePromptTasks === null
        ? new Set()
        : new Set(orderedDuePromptTasks.map((p) => p.promptID)),
    [orderedDuePromptTasks],
  );

  const prompts = usePrompts(dataRecordClient, duePromptIDSet);

  const duePromptAttachmentIDSet: Set<AttachmentID> = useMemo(
    () => (prompts ? getAttachmentIDsInPrompts(prompts) : new Set()),
    [prompts],
  );

  const attachments = useAttachments(
    dataRecordClient,
    duePromptAttachmentIDSet,
  );

  return useMemo(() => {
    console.log("Computing review items");
    console.log("[Performance] Computing review items", Date.now() / 1000.0);
    return (
      orderedDuePromptTasks
        ?.map((task): PromptReviewItem | null => {
          const prompt = prompts?.get(task.promptID);
          if (prompt) {
            if (prompt instanceof Error) {
              console.error(
                "Error getting task's prompt",
                task.promptID,
                prompt,
              );
              // TODO surface error more effectively
              return null;
            } else {
              const promptState =
                promptStates?.get(getIDForPromptTask(task)) ?? null;

              const attachmentResolutionMap: AttachmentResolutionMap = new Map();
              for (const attachmentID of getAttachmentIDsInPrompt(prompt)) {
                const maybeAttachment = attachments?.get(attachmentID);
                if (maybeAttachment && !(maybeAttachment instanceof Error)) {
                  attachmentResolutionMap.set(attachmentID, maybeAttachment);
                } else {
                  console.log(
                    "Still loading attachment for task spec",
                    task.promptID,
                    attachmentID,
                  );
                  return null; // TODO order not jumping egregiously when this task finally becomes available
                }
              }
              // TODO validate that task spec, task state, and task parameter types all match up... or, better, design the API to ensure that more reasonably
              return {
                reviewItemType: promptReviewItemType,
                prompt,
                promptState,
                promptParameters: task.promptParameters,
                attachmentResolutionMap,
              } as PromptReviewItem;
            }
          } else {
            return null;
          }
        })
        .filter<ReviewItem>(
          (task: PromptReviewItem | null): task is PromptReviewItem => !!task,
        ) ?? null
    );
  }, [orderedDuePromptTasks, promptStates, prompts, attachments]);
}
