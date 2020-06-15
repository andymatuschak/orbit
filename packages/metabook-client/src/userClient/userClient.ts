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
      provenanceType: PromptProvenanceType;
      updatedAfterServerTimestamp?: ServerTimestamp;
    }
  | {
      updatedAfterServerTimestamp?: ServerTimestamp;
    }
);

export interface MetabookUserClient {
  getPromptStates(query: PromptStateQuery): Promise<PromptStateCache[]>;

  subscribeToActionLogs(
    afterServerTimestamp: ServerTimestamp | null,
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
    afterServerTimestamp: ServerTimestamp | null,
    limit: number,
  ): Promise<
    { log: ActionLog; id: ActionLogID; serverTimestamp: ServerTimestamp }[]
  >;

  recordActionLogs(logs: ActionLog[]): Promise<unknown>;
}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  PromptTaskID,
  PromptState
>;
