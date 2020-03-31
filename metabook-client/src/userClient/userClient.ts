import { MetabookActionOutcome, PromptState } from "metabook-core";
import { EncodedPromptID } from "metabook-core/dist/promptID";
import { MetabookUnsubscribe } from "../types/unsubscribe";
import { PromptTaskID } from "../util/promptTaskID";

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

  recordAction(
    action: MetabookAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> };
}

// TODO
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MetabookCardStateQuery {}

export type MetabookPromptStateSnapshot = ReadonlyMap<
  EncodedPromptID,
  PromptState
>;

export interface MetabookAction {
  promptTaskID: PromptTaskID;
  sessionID: string | null;
  timestampMillis: number;
  actionOutcome: MetabookActionOutcome;
  basePromptState: PromptState | null;
}
