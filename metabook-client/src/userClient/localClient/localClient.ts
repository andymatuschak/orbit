import {
  ActionLog,
  applyActionLogToPromptState,
  getPromptActionLogFromActionLog,
  promptActionLogCanBeAppliedToPromptState,
  PromptState,
  PromptTaskID,
} from "metabook-core";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import getPromptStates from "../getPromptStates";
import {
  PromptStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

export class MetabookLocalUserClient implements MetabookUserClient {
  private readonly latestPromptStates: Map<PromptTaskID, PromptState>;
  private readonly cardStateSubscribers: Set<CardStateSubscriber>;
  private readonly logs: ActionLog[];

  constructor() {
    this.latestPromptStates = new Map();
    this.cardStateSubscribers = new Set();
    this.logs = [];
  }

  getPromptStates(
    query: PromptStateQuery,
  ): Promise<MetabookPromptStateSnapshot> {
    return getPromptStates(this, query);
  }

  async recordActionLogs(logs: ActionLog[]): Promise<unknown> {
    for (const log of logs) {
      const promptActionLog = getPromptActionLogFromActionLog(log);
      const cachedPromptState =
        this.latestPromptStates.get(promptActionLog.taskID) ?? null;
      if (
        promptActionLogCanBeAppliedToPromptState(
          promptActionLog,
          cachedPromptState,
        )
      ) {
        const newPromptState = applyActionLogToPromptState({
          promptActionLog,
          basePromptState: cachedPromptState,
          schedule: "default",
        });
        if (newPromptState instanceof Error) {
          throw newPromptState;
        }
        this.latestPromptStates.set(promptActionLog.taskID, newPromptState);
      }
    }
    this.logs.push(...logs);

    return new Promise((resolve) => {
      // We return control to the caller before calling subscribers and resolving.
      setTimeout(() => {
        this.notifyCardStateSubscribers();
        resolve();
      }, 0);
    });
  }

  subscribeToPromptStates(
    query: PromptStateQuery,
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

  getAllLogs(): ActionLog[] {
    return [...this.logs];
  }

  private notifyCardStateSubscribers() {
    for (const { onCardStatesDidUpdate } of this.cardStateSubscribers) {
      onCardStatesDidUpdate(new Map(this.latestPromptStates));
    }
  }
}

interface CardStateSubscriber {
  query: PromptStateQuery;
  onCardStatesDidUpdate: (newCardStates: MetabookPromptStateSnapshot) => void;
  onError: (error: Error) => void;
}
