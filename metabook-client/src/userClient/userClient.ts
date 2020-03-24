import { PromptData, CardState, MetabookActionOutcome } from "metabook-core";
import { PromptType } from "metabook-core/dist/types/promptData";
import { MetabookUnsubscribe } from "../types/unsubscribe";

export interface MetabookUserClient {
  subscribeToCardStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookCardStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe;

  getCardStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookCardStateSnapshot>;

  recordCardStateUpdate(
    update: MetabookAction,
  ): { newCardState: CardState; commit: Promise<unknown> };
}

// TODO
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MetabookCardStateQuery {}

export type MetabookCardStateSnapshot = {
  [key: string]: CardState;
};

/*  subscribeToPromptData(
    cardIDs: string[],
    onPromptDataDidUpdate: (newCardStates: PromptDataSnapshot) => void,
  ): MetabookUnsubscribe;

export type PromptDataSnapshot = {
  [key: string]:
    | { promptData: PromptData; error: null }
    | { promptData: null; error: Error }
    | undefined; // i.e. we haven't yet resolved the card data; future updates will resolve this to either of the other alternates
};*/

export interface MetabookAction {
  promptID: string;
  promptType: PromptType;
  sessionID: string | null;
  timestamp: number;
  actionOutcome: MetabookActionOutcome;
  baseCardState: CardState | null;
}
