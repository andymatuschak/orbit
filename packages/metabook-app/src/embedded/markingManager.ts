import { PromptState, PromptTaskID } from "metabook-core";
import {
  EmbeddedScreenConfiguration,
  EmbeddedScreenPromptStatesUpdateEvent,
  embeddedScreenPromptStatesUpdateEventName,
} from "metabook-embedded-support";
import {
  getPromptTaskIDForReviewItem,
  ReviewAreaProps,
  useWeakRef,
} from "metabook-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReviewSessionManager } from "../reviewSessionManager";
import { getFirebaseFunctions } from "../util/firebase";
import {
  EmbeddedActionsRecord,
  getActionsRecordForMarking,
  mergePendingActionsRecords,
} from "./markingActions";
import { EmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState";

async function submitPendingActionsRecord(
  actionsRecord: EmbeddedActionsRecord,
): Promise<unknown> {
  // TODO replace with traditional HTTP API call
  return getFirebaseFunctions().httpsCallable("recordEmbeddedActions")({
    logs: actionsRecord.logEntries.map(({ log }) => log),
    promptsByID: actionsRecord.promptsByID,
    attachmentURLsByID: actionsRecord.attachmentURLsByID,
  });
}

function sendUpdatedPromptStatesToHost(
  promptStates: Map<PromptTaskID, PromptState>,
) {
  const event: EmbeddedScreenPromptStatesUpdateEvent = {
    type: embeddedScreenPromptStatesUpdateEventName,
    promptStates,
  };
  parent.postMessage(event, "*");
}

export function useMarkingManager({
  authenticationState,
  configuration,
  hostPromptStates,
}: {
  authenticationState: EmbeddedAuthenticationState;
  configuration: EmbeddedScreenConfiguration;
  hostPromptStates: Map<PromptTaskID, PromptState> | null;
}): {
  onMark: ReviewAreaProps["onMark"];
  hasUncommittedActions: boolean;
} & ReviewSessionManagerState {
  const reviewSessionStartTimestampMillis = useRef(Date.now());
  const [
    pendingActionsRecord,
    setPendingActionsRecord,
  ] = useState<EmbeddedActionsRecord | null>(null);

  const reviewSessionManager = useReviewSessionManager();

  // Merge host prompt states in when they change.
  useEffect(() => {
    setPromptStates((promptStates) =>
      hostPromptStates
        ? new Map([...promptStates, ...hostPromptStates])
        : promptStates,
    );
  }, [hostPromptStates]);

  const weakPromptStates = useWeakRef(promptStates);
  const onMark: ReviewAreaProps["onMark"] = useCallback(
    (marking) => {
      const newRecord = getActionsRecordForMarking({
        hostMetadata: configuration.embeddedHostMetadata,
        marking: marking,
        sessionStartTimestampMillis: reviewSessionStartTimestampMillis.current,
        basePromptState:
          weakPromptStates.current.get(
            getPromptTaskIDForReviewItem(marking.reviewItem),
          ) ?? null,
      });
      setPendingActionsRecord((pendingActionsRecord) =>
        pendingActionsRecord
          ? mergePendingActionsRecords(pendingActionsRecord, newRecord)
          : newRecord,
      );
      setPromptStates((localStates) => {
        const newPromptStates = updatePromptStates(
          newRecord.logEntries,
          localStates,
        );
        sendUpdatedPromptStatesToHost(newPromptStates);
        return newPromptStates;
      });
    },
    [configuration],
  );

  const { isDebug } = configuration;
  useEffect(() => {
    if (!pendingActionsRecord) {
      return;
    }
    if (isDebug) {
      console.log("Skipping action because we're in debug mode");
      return;
    }
    if (authenticationState.status === "signedIn") {
      submitPendingActionsRecord(pendingActionsRecord)
        .then(() => {
          console.log("Saved actions to server", pendingActionsRecord);
          setPendingActionsRecord(null);
        })
        .catch((error) => {
          console.error(
            `Failed to save record: ${error.message}`,
            pendingActionsRecord,
          );
        });
    } else {
      console.log(
        "Queueing actions for after user authenticates",
        pendingActionsRecord,
      );
    }
  }, [pendingActionsRecord, authenticationState, isDebug]);

  return {
    onMark,
    hasUncommittedActions: !!pendingActionsRecord,
  };
}
