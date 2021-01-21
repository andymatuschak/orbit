import { useCallback, useEffect, useState } from "react";
import { getFirebaseFunctions } from "../util/firebase";
import {
  EmbeddedActionsRecord,
  mergePendingActionsRecords,
} from "./markingActions";
import { EmbeddedAuthenticationStatus } from "./useEmbeddedAuthenticationState";

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

export function useEmbeddedNetworkQueue(
  authenticationStatus: EmbeddedAuthenticationStatus,
): {
  commitActionsRecord: (actionRecord: EmbeddedActionsRecord) => void;
  hasUncommittedActions: boolean;
} {
  const [
    pendingActionsRecord,
    setPendingActionsRecord,
  ] = useState<EmbeddedActionsRecord | null>(null);

  // Attempt to drain queue when inputs change.
  useEffect(() => {
    if (!pendingActionsRecord) {
      return;
    }
    if (authenticationStatus === "signedIn") {
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
  }, [pendingActionsRecord, authenticationStatus]);

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
