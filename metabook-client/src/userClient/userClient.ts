import { ActionLog, PromptState, PromptTaskID } from "metabook-core";
import { PromptStateCache, ServerTimestamp } from "metabook-firebase-support";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookUserClient {
  getDuePromptStates(
    thresholdTimestampMillis: number,
  ): Promise<PromptStateCache[]>;

  subscribeToActionLogs(
    afterServerTimestamp: ServerTimestamp | null,
    onNewLogs: (
      newLogs: { log: ActionLog; serverTimestamp: ServerTimestamp }[],
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe;

  getActionLogs(
    afterServerTimestamp: ServerTimestamp | null,
    limit: number,
  ): Promise<{ log: ActionLog; serverTimestamp: ServerTimestamp }[]>;

  recordActionLogs(logs: ActionLog[]): Promise<unknown>;
}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  PromptTaskID,
  PromptState
>;
