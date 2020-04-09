import {
  MetabookActionOutcome,
  PromptID,
  PromptParameters,
  PromptSpec,
  PromptState,
  PromptTaskParameters,
} from "metabook-core";
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

  recordAction(
    action: MetabookReviewAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> };
}

// TODO
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MetabookCardStateQuery {}

export type MetabookPromptStateSnapshot = ReadonlyMap<PromptID, PromptState>;

export interface MetabookReviewAction {
  promptSpec: PromptSpec;
  promptParameters: PromptParameters;
  promptTaskParameters: PromptTaskParameters;

  sessionID: string | null;
  timestampMillis: number;
  actionOutcome: MetabookActionOutcome;
  basePromptState: PromptState | null;
}
