import { ExtensionStorage } from "@bacons/apple-targets";
import { File } from "expo-file-system";
import { useEffect } from "react";
import { Alert, AppState, type AppStateStatus } from "react-native";
import { handleIngestEventWithDefaultStore } from "./handleIngestEvent.js";

const appGroup = "group.com.withorbit.native";
const completedPayloadKeyPrefix = "completedIngestPayload.";
const failedPayloadKeyPrefix = "failedIngestPayload.";
const pendingIngestGenerationKey = "pendingIngestGeneration";
const pendingIngestPayloadsKey = "pendingIngestPayloads";
const retryAfterKeyPrefix = "ingestRetryAfter.";
const retryAttemptKeyPrefix = "ingestRetryAttempt.";
const activePollingIntervalMillis = 1_000;
const initialRetryDelayMillis = 2_000;
const maximumRetryAttempts = 5;
const maximumRetryDelayMillis = 5 * 60_000;
const storage = new ExtensionStorage(appGroup);

type PendingIngestPayload = {
  fileURL: string;
  id: string;
};

let activeDrain: Promise<void> | undefined;
let failedRecoveryPromptIsActive = false;
let forceDrainAfterActiveDrain = false;
let lastDrainedGeneration: string | null | undefined;
let nextRetryAtMillis: number | undefined;
const presentedFailedPayloadIDs = new Set<string>();

function isPendingIngestPayload(value: unknown): value is PendingIngestPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "fileURL" in value &&
    typeof value.fileURL === "string"
  );
}

function readPendingIngestPayloads(): PendingIngestPayload[] {
  const storedValue = storage.get(pendingIngestPayloadsKey);
  // The package's unsupported-platform fallback returns undefined at runtime.
  if (storedValue == null) {
    return [];
  }

  const parsedValue: unknown = JSON.parse(storedValue);
  if (
    !Array.isArray(parsedValue) ||
    !parsedValue.every(isPendingIngestPayload)
  ) {
    throw new Error("The pending ingest queue is malformed");
  }
  return parsedValue;
}

function completedPayloadKey(id: string) {
  return `${completedPayloadKeyPrefix}${id}`;
}

function hasCompletedIngestPayload(id: string) {
  return storage.get(completedPayloadKey(id)) != null;
}

function markIngestPayloadCompleted(id: string) {
  // The app never rewrites the native-owned queue. A per-payload completion
  // key avoids losing a payload if an App Intent appends while JavaScript is
  // finishing another import. The next App Intent prunes completed entries.
  storage.set(completedPayloadKey(id), 1);
}

function failedPayloadKey(id: string) {
  return `${failedPayloadKeyPrefix}${id}`;
}

function retryAttemptKey(id: string) {
  return `${retryAttemptKeyPrefix}${id}`;
}

function retryAfterKey(id: string) {
  return `${retryAfterKeyPrefix}${id}`;
}

function readStoredNumber(key: string) {
  const value = Number(storage.get(key));
  return Number.isFinite(value) ? value : 0;
}

function clearRetryState(id: string) {
  storage.remove(retryAttemptKey(id));
  storage.remove(retryAfterKey(id));
}

function presentFailedPayloadRecovery(
  payload: PendingIngestPayload,
  message: string,
) {
  if (
    failedRecoveryPromptIsActive ||
    presentedFailedPayloadIDs.has(payload.id)
  ) {
    return;
  }

  failedRecoveryPromptIsActive = true;
  presentedFailedPayloadIDs.add(payload.id);
  Alert.alert(
    "Couldn't import file",
    `${message}\n\nA recovery copy remains in Orbit's shared inbox.`,
    [
      {
        text: "Keep Copy",
        style: "cancel",
        onPress: () => {
          failedRecoveryPromptIsActive = false;
          void consumePendingIngestPayloads(true);
        },
      },
      {
        text: "Discard Copy",
        style: "destructive",
        onPress: () => {
          failedRecoveryPromptIsActive = false;
          try {
            storage.remove(failedPayloadKey(payload.id));
            completePayload(payload);
            void consumePendingIngestPayloads(true);
          } catch (error) {
            console.error("Unable to discard an ingest payload", error);
          }
        },
      },
    ],
  );
}

function markIngestPayloadFailed(payload: PendingIngestPayload, message: string) {
  clearRetryState(payload.id);
  storage.set(failedPayloadKey(payload.id), message);
  presentFailedPayloadRecovery(payload, message);
}

function completePayload(payload: PendingIngestPayload) {
  markIngestPayloadCompleted(payload.id);
  clearRetryState(payload.id);

  const payloadFile = new File(payload.fileURL);
  if (payloadFile.exists) {
    payloadFile.delete();
  }
}

function scheduleRetry(
  payload: PendingIngestPayload,
  message: string,
): "failed" | "scheduled" {
  const attemptCount = readStoredNumber(retryAttemptKey(payload.id)) + 1;
  if (attemptCount >= maximumRetryAttempts) {
    markIngestPayloadFailed(
      payload,
      `${message}\n\nOrbit stopped retrying after ${maximumRetryAttempts} attempts.`,
    );
    return "failed";
  }

  const delay = Math.min(
    initialRetryDelayMillis * 2 ** (attemptCount - 1),
    maximumRetryDelayMillis,
  );
  const retryAt = Date.now() + delay;
  storage.set(retryAttemptKey(payload.id), attemptCount);
  storage.set(retryAfterKey(payload.id), retryAt);
  nextRetryAtMillis = Math.min(nextRetryAtMillis ?? retryAt, retryAt);
  return "scheduled";
}

function scheduleRetrySafely(payload: PendingIngestPayload, message: string) {
  try {
    return scheduleRetry(payload, message);
  } catch (error) {
    console.error("Unable to persist an ingest retry", error);
    const retryAt = Date.now() + initialRetryDelayMillis;
    nextRetryAtMillis = Math.min(nextRetryAtMillis ?? retryAt, retryAt);
    return "scheduled" as const;
  }
}

async function drainPendingIngestPayloads(ignoreRetryDelay: boolean) {
  let pendingPayloads: PendingIngestPayload[];
  try {
    pendingPayloads = readPendingIngestPayloads();
  } catch (error) {
    console.error("Unable to read the pending ingest queue", error);
    return;
  }

  nextRetryAtMillis = undefined;
  for (const payload of pendingPayloads) {
    if (hasCompletedIngestPayload(payload.id)) {
      continue;
    }

    const failedMessage = storage.get(failedPayloadKey(payload.id));
    if (failedMessage != null) {
      if (ignoreRetryDelay) {
        presentFailedPayloadRecovery(payload, failedMessage);
      }
      continue;
    }

    const retryAt = readStoredNumber(retryAfterKey(payload.id));
    if (!ignoreRetryDelay && retryAt > Date.now()) {
      nextRetryAtMillis = Math.min(nextRetryAtMillis ?? retryAt, retryAt);
      // Preserve FIFO ordering: a later snapshot must never overtake an older
      // snapshot which is waiting to retry.
      break;
    }

    let json: string;
    try {
      json = await new File(payload.fileURL).text();
    } catch (error) {
      console.error("Unable to read a pending ingest payload", error);
      const retryStatus = scheduleRetrySafely(
        payload,
        "Orbit couldn't read the queued import file.",
      );
      if (retryStatus === "scheduled") {
        break;
      }
      continue;
    }

    const result = await handleIngestEventWithDefaultStore({
      json,
    });
    if (result.status === "retryable-failure") {
      const retryStatus = scheduleRetrySafely(payload, result.message);
      if (retryStatus === "scheduled") {
        break;
      }
      continue;
    }

    try {
      if (result.status === "succeeded") {
        completePayload(payload);
      } else {
        markIngestPayloadFailed(payload, result.message);
      }
    } catch (error) {
      console.error("Unable to finalize an ingest payload", error);
      // Finalization records ownership of the payload. Do not let a later
      // snapshot overtake it if that record could not be written.
      const retryStatus = scheduleRetrySafely(
        payload,
        "Orbit couldn't finish recording the queued import.",
      );
      if (retryStatus === "scheduled") {
        break;
      }
    }
  }
}

function readPendingIngestGeneration() {
  return storage.get(pendingIngestGenerationKey) ?? null;
}

function consumePendingIngestPayloads(force = false): Promise<void> {
  const generation = readPendingIngestGeneration();
  if (activeDrain !== undefined) {
    forceDrainAfterActiveDrain ||= force;
    return activeDrain;
  }
  const hasDueRetry =
    nextRetryAtMillis !== undefined && nextRetryAtMillis <= Date.now();
  if (!force && generation === lastDrainedGeneration && !hasDueRetry) {
    return Promise.resolve();
  }

  activeDrain = drainPendingIngestPayloads(force).finally(() => {
    // Mark this generation only after its drain finishes. If native code
    // appends during the drain, the scalar generation changes and the next
    // poll picks up that payload without repeatedly decoding the JSON queue.
    lastDrainedGeneration = generation;
    activeDrain = undefined;
    if (forceDrainAfterActiveDrain) {
      forceDrainAfterActiveDrain = false;
      void consumePendingIngestPayloads(true);
    }
  });
  return activeDrain;
}

export function useIngestIntentQueue() {
  useEffect(() => {
    let pollingInterval: ReturnType<typeof setInterval> | undefined;

    const stopPolling = () => {
      if (pollingInterval !== undefined) {
        clearInterval(pollingInterval);
        pollingInterval = undefined;
      }
    };

    const consumeWhenActive = (state: AppStateStatus) => {
      stopPolling();
      if (state === "active") {
        void consumePendingIngestPayloads(true);
        // An App Intent can run while Orbit is already active, in which case
        // AppState emits no transition. Poll only a scalar generation counter;
        // the potentially large JSON queue is read only when it changes.
        pollingInterval = setInterval(() => {
          void consumePendingIngestPayloads();
        }, activePollingIntervalMillis);
      } else {
        failedRecoveryPromptIsActive = false;
        presentedFailedPayloadIDs.clear();
      }
    };

    consumeWhenActive(AppState.currentState);
    const subscription = AppState.addEventListener("change", consumeWhenActive);
    return () => {
      stopPolling();
      subscription.remove();
    };
  }, []);
}
