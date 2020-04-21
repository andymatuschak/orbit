import { ActionLog, PromptState, PromptTaskID } from "metabook-core";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookUserClient {
  subscribeToPromptStates(
    query: PromptStateQuery,
    onPromptStatesDidUpdate: (
      newPromptStates: MetabookPromptStateSnapshot,
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe;

  getPromptStates(
    query: PromptStateQuery,
  ): Promise<MetabookPromptStateSnapshot>;

  recordActionLogs(logs: ActionLog[]): Promise<unknown>;
}

// TODO
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PromptStateQuery {
  dueBeforeTimestampMillis?: number;
}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  PromptTaskID,
  PromptState
>;
