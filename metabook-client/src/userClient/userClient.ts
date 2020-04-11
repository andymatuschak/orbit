import { ActionLog, PromptState, PromptTaskID } from "metabook-core";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookUserClient {
  subscribeToPromptStates(
    query: MetabookCardStateQuery,
    onPromptStatesDidUpdate: (
      newPromptStates: MetabookPromptStateSnapshot,
    ) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe;

  getPromptStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookPromptStateSnapshot>;

  recordActionLogs(logs: ActionLog[]): Promise<unknown>;
}

// TODO
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MetabookCardStateQuery {}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  PromptTaskID,
  PromptState
>;
