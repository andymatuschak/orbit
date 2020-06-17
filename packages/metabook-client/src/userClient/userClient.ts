import {
  ActionLog,
  ActionLogID,
  PromptProvenanceType,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { PromptStateCache, ServerTimestamp } from "metabook-firebase-support";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export type PromptStateQuery = { limit?: number } & (
  | {
      dueBeforeTimestampMillis: number;
    }
  | {
      provenanceType?: PromptProvenanceType;
      updatedAfterServerTimestamp?: ServerTimestamp;
      updatedOnOrBeforeServerTimestamp?: ServerTimestamp;
    }
);

export type ActionLogQuery = {
  limit?: number;
  afterServerTimestamp?: ServerTimestamp;
  onOrBeforeServerTimestamp?: ServerTimestamp;
};

export interface MetabookUserClient {
  getPromptStates(query: PromptStateQuery): Promise<PromptStateCache[]>;

  subscribeToActionLogs(
    query: ActionLogQuery,
    onNewLogs: (
      newLogs: {
        log: ActionLog;
        id: ActionLogID;
        serverTimestamp: ServerTimestamp;
      }[],
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe;

  getActionLogs(
    query: ActionLogQuery,
  ): Promise<
    { log: ActionLog; id: ActionLogID; serverTimestamp: ServerTimestamp }[]
  >;

  recordActionLogs(logs: ActionLog[]): Promise<unknown>;
}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  PromptTaskID,
  PromptState
>;
