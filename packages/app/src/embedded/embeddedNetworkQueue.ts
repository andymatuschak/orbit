import OrbitAPIClient from "@withorbit/api-client";
import { useCallback, useEffect, useState } from "react";
import useByrefCallback from "../util/useByrefCallback.js";
import {
  EmbeddedActionsRecord,
  mergePendingActionsRecords,
} from "./markingActions.js";
import { EmbeddedAuthenticationStatus } from "./useEmbeddedAuthenticationState.js";

async function submitPendingActionsRecord(
  actionsRecord: EmbeddedActionsRecord,
  apiClient: OrbitAPIClient,
): Promise<void> {
  if (actionsRecord.ingestedAttachmentEntries) {
    await apiClient.ingestAttachmentsFromURLs2(
      actionsRecord.ingestedAttachmentEntries,
    );
  }
  await apiClient.putEvents2(actionsRecord.events);
}

export function useEmbeddedNetworkQueue(
  authenticationStatus: EmbeddedAuthenticationStatus,
  apiClient: OrbitAPIClient,
): {
  commitActionsRecord: (actionRecord: EmbeddedActionsRecord) => void;
  hasUncommittedActions: boolean;
} {
  const [pendingActionsRecord, setPendingActionsRecord] =
    useState<EmbeddedActionsRecord | null>(null);

  const drainQueue = useByrefCallback((record: EmbeddedActionsRecord) => {
    if (authenticationStatus === "signedIn") {
      submitPendingActionsRecord(record, apiClient)
        .then(() => {
          console.log("Saved actions to server", pendingActionsRecord);
          setPendingActionsRecord(null);
        })
        .catch((error) => {
          // TODO: Propagate into UI.
          // TODO: If error is a network error, retry when online.
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
  });

  // Attempt to drain queue when inputs change.
  useEffect(() => {
    if (pendingActionsRecord) drainQueue(pendingActionsRecord);
  }, [pendingActionsRecord, authenticationStatus, drainQueue]);

  return {
    commitActionsRecord: useCallback(
      (newRecord: EmbeddedActionsRecord): void => {
        setPendingActionsRecord((pendingActionsRecord) =>
          pendingActionsRecord
            ? mergePendingActionsRecords(pendingActionsRecord, newRecord)
            : newRecord,
        );
      },
      [],
    ),
    hasUncommittedActions: !!pendingActionsRecord,
  };
}
