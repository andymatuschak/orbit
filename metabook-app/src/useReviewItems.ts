import {
  MetabookDataClient,
  MetabookDataSnapshot,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "metabook-client";
import {
  AttachmentID,
  AttachmentURLReference,
  decodePrompt,
  encodePrompt,
  getDuePromptIDs,
  Prompt,
  PromptField,
  PromptSpec,
  PromptSpecID,
  QAPromptSpec,
} from "metabook-core";
import {
  AttachmentResolutionMap,
  PromptReviewItem,
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

function usePromptSpecs(
  dataClient: MetabookDataClient,
  promptSpecIDs: Set<PromptSpecID>,
): MetabookDataSnapshot<PromptSpecID, PromptSpec> | null {
  const unsubscribeFromDataRequest = useRef<(() => void) | null>(null);
  const [promptSpecs, setPromptSpecs] = useState<MetabookDataSnapshot<
    PromptSpecID,
    PromptSpec
  > | null>(null);

  useEffect(() => {
    unsubscribeFromDataRequest.current?.();
    console.log("Fetching prompt specs", promptSpecIDs);
    const { unsubscribe } = dataClient.getPromptSpecs(
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

function getAttachmentIDsInPromptSpec(spec: PromptSpec): Set<AttachmentID> {
  const output = new Set<AttachmentID>();
  function visitQAPromptSpec(qaPromptSpec: QAPromptSpec) {
    function visitPromptField(promptField: PromptField) {
      promptField.attachments.forEach((attachmentIDReference) =>
        output.add(attachmentIDReference.id),
      );
    }

    visitPromptField(qaPromptSpec.question);
    visitPromptField(qaPromptSpec.answer);
    if (qaPromptSpec.explanation) {
      visitPromptField(qaPromptSpec.explanation);
    }
  }

  switch (spec.promptSpecType) {
    case "basic":
      visitQAPromptSpec(spec);
      break;
    case "applicationPrompt":
      spec.variants.forEach(visitQAPromptSpec);
      break;
    case "cloze":
      break;
  }
  return output;
}

function getAttachmentIDsInPromptSpecs(
  promptSpecs: MetabookDataSnapshot<PromptSpecID, PromptSpec>,
): Set<AttachmentID> {
  const output: Set<AttachmentID> = new Set();
  for (const maybeSpec of promptSpecs.values()) {
    if (maybeSpec && !(maybeSpec instanceof Error)) {
      for (const value of getAttachmentIDsInPromptSpec(maybeSpec)) {
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

  const duePromptSpecAttachmentIDSet: Set<AttachmentID> = useMemo(
    () =>
      promptSpecs ? getAttachmentIDsInPromptSpecs(promptSpecs) : new Set(),
    [promptSpecs],
  );

  const attachments = useAttachments(dataClient, duePromptSpecAttachmentIDSet);

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

              const attachmentResolutionMap: AttachmentResolutionMap = new Map();
              for (const attachmentID of getAttachmentIDsInPromptSpec(
                promptSpec,
              )) {
                const maybeAttachment = attachments?.get(attachmentID);
                if (maybeAttachment && !(maybeAttachment instanceof Error)) {
                  attachmentResolutionMap.set(attachmentID, maybeAttachment);
                } else {
                  console.log(
                    "Still loading attachment for prompt spec",
                    prompt.promptSpecID,
                    attachmentID,
                  );
                  return null; // TODO order not jumping egregiously when this prompt finally becomes available
                }
              }
              // TODO validate that prompt spec, prompt state, and prompt parameter types all match up... or, better, design the API to ensure that more reasonably
              return {
                reviewItemType: "prompt",
                promptSpec,
                promptState,
                promptParameters: prompt.promptParameters,
                attachmentResolutionMap,
              } as PromptReviewItem;
            }
          } else {
            console.log("Still loading prompt spec", prompt.promptSpecID);
            return null;
          }
        })
        .filter<ReviewItem>(
          (task: PromptReviewItem | null): task is PromptReviewItem => !!task,
        ) ?? null
    );
  }, [orderedDuePrompts, promptStates, promptSpecs, attachments]);
}
