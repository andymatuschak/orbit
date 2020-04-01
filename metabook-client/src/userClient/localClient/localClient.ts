import { encodePrompt, PromptID, PromptState } from "metabook-core";
import { MetabookActionLog } from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import { getNextPromptStateForActionLog } from "../../util/getNextPromptStateForActionLog";
import getPromptStates from "../getPromptStates";
import {
  MetabookAction,
  MetabookCardStateQuery,
  MetabookPromptStateSnapshot,
  MetabookUserClient,
} from "../userClient";

export class MetabookLocalUserClient implements MetabookUserClient {
  private readonly latestPromptStates: Map<PromptID, PromptState>;
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
    const newPromptState = getNextPromptStateForActionLog(
      actionLog,
      action.promptSpec,
    );

    this.latestPromptStates.set(
      encodePrompt(actionLog.promptTask.prompt),
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
