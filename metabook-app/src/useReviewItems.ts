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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { enableFirebasePersistence, PersistenceStatus } from "./firebase";

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

function usePrompts(
  dataClient: MetabookDataClient,
  promptIDs: Set<PromptID>,
): MetabookDataSnapshot<PromptID, Prompt> | null {
  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const [prompts, setPrompts] = useState<MetabookDataSnapshot<
    PromptID,
    Prompt
  > | null>(null);

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    console.log("Fetching prompt specs", promptIDs);
    const { unsubscribe } = dataClient.getPrompts(promptIDs, (newPrompts) => {
      console.log("Got new prompt specs", newPrompts);
      setPrompts(newPrompts);
    });
    unsubscribeFromDataRequest.current = unsubscribe;

    return () => {
      unsubscribeFromDataRequest.current?.();
      unsubscribeFromDataRequest.current = null;
    };
  }, [dataClient, promptIDs]);

  return prompts;
}

function useAttachments(
  dataClient: MetabookDataClient,
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

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    console.log("Fetching attachments", attachmentIDs);
    const { unsubscribe } = dataClient.getAttachments(
      attachmentIDs,
      (attachmentResolutionMap) => {
        console.log("Got new attachments", attachmentIDs);
        setAttachmentResolutionMap(attachmentResolutionMap);
      },
    );
    unsubscribeFromDataRequest.current = unsubscribe;

    return () => {
      unsubscribeFromDataRequest.current?.();
      unsubscribeFromDataRequest.current = null;
    };
  }, [dataClient, attachmentIDs]);

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
  dataClient: MetabookDataClient,
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

  const prompts = usePrompts(dataClient, duePromptIDSet);

  const duePromptAttachmentIDSet: Set<AttachmentID> = useMemo(
    () => (prompts ? getAttachmentIDsInPrompts(prompts) : new Set()),
    [prompts],
  );

  const attachments = useAttachments(dataClient, duePromptAttachmentIDSet);

  return useMemo(() => {
    console.log("Computing review items");
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
            console.log("Still loading task spec", task.promptID);
            return null;
          }
        })
        .filter<ReviewItem>(
          (task: PromptReviewItem | null): task is PromptReviewItem => !!task,
        ) ?? null
    );
  }, [orderedDuePromptTasks, promptStates, prompts, attachments]);
}
