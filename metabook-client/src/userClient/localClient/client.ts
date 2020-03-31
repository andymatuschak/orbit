import { PromptState } from "metabook-core";
import { encodePromptID } from "metabook-core/dist/promptID";
import { PromptStates } from "metabook-core/dist/types/promptState";
import { MetabookActionLog } from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { getPromptIDForPromptTaskID } from "../../util/promptTaskID";
import {
  MetabookPromptStateSnapshot,
  MetabookAction,
  MetabookCardStateQuery,
  MetabookUserClient,
} from "../userClient";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import getPromptStates from "../getPromptStates";
import { getNextPromptStateForActionLog } from "../../util/getNextPromptStateForActionLog";

export class MetabookLocalUserClient implements MetabookUserClient {
  private readonly latestPromptStates: PromptStates;
  private readonly cardStateSubscribers: Set<CardStateSubscriber>;
  private readonly logs: MetabookActionLog[];

  constructor() {
    this.latestPromptStates = new Map();
    this.cardStateSubscribers = new Set();
    this.logs = [];
  }

  getPromptStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  recordAction(
    action: MetabookAction,
  ): { newPromptState: PromptState; commit: Promise<unknown> } {
    const actionLog = getActionLogForAction(action);
    const newPromptState = getNextPromptStateForActionLog(actionLog);

    this.latestPromptStates.set(
      encodePromptID(getPromptIDForPromptTaskID(action.promptTaskID)),
      newPromptState,
    );
    this.logs.push(actionLog);
    return {
      newPromptState,
      commit: new Promise((resolve) => {
        // We return control to the caller before calling subscribers and resolving.
        setTimeout(() => {
          this.notifyCardStateSubscribers();
          resolve();
        }, 0);
      }),
    };
  }

  subscribeToPromptStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    onCardStatesDidUpdate(new Map(this.latestPromptStates));
    const subscriber = { query, onCardStatesDidUpdate, onError };
    this.cardStateSubscribers.add(subscriber);
    return () => {
      this.cardStateSubscribers.delete(subscriber);
    };
  }

  getAllLogs(): MetabookActionLog[] {
    return [...this.logs];
  }

  private notifyCardStateSubscribers() {
    for (const { onCardStatesDidUpdate } of this.cardStateSubscribers) {
      onCardStatesDidUpdate(new Map(this.latestPromptStates));
    }
  }
}

interface CardStateSubscriber {
  query: MetabookCardStateQuery;
  onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void;
  onError: (error: Error) => void;
}
