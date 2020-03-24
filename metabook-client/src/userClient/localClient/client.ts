import { CardState } from "metabook-core";
import { MetabookActionLog } from "../../types/actionLog";
import { MetabookUnsubscribe } from "../../types/unsubscribe";
import {
  MetabookCardStateSnapshot,
  MetabookAction,
  MetabookCardStateQuery,
  MetabookUserClient,
} from "../userClient";
import { getActionLogForAction } from "../../util/getActionLogForAction";
import getCardStates from "../getCardStates";
import { getNextCardStateForActionLog } from "../../util/getNextCardStateForActionLog";

export class MetabookLocalUserClient implements MetabookUserClient {
  private readonly latestCardStates: { [key: string]: CardState };
  private readonly cardStateSubscribers: Set<CardStateSubscriber>;
  private readonly logs: MetabookActionLog[];

  constructor() {
    this.latestCardStates = {};
    this.cardStateSubscribers = new Set();
    this.logs = [];
  }

  getCardStates(
    query: MetabookCardStateQuery,
  ): Promise<MetabookCardStateSnapshot> {
    return getCardStates(this, query);
  }

  recordCardStateUpdate(
    action: MetabookAction,
  ): { newCardState: CardState; commit: Promise<unknown> } {
    const orderSeed = Math.random();
    const actionLog = getActionLogForAction(action, orderSeed);
    const newCardState = getNextCardStateForActionLog(actionLog);

    this.latestCardStates[action.promptID] = newCardState;
    this.logs.push(actionLog);
    return {
      newCardState,
      commit: new Promise(resolve => {
        setTimeout(() => {
          this.notifyCardStateSubscribers();
          resolve();
        }, 0);
      }),
    };
  }

  subscribeToCardStates(
    query: MetabookCardStateQuery,
    onCardStatesDidUpdate: (newCardStates: MetabookCardStateSnapshot) => void,
    onError: (error: Error) => void,
  ): MetabookUnsubscribe {
    onCardStatesDidUpdate({ ...this.latestCardStates });
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
      onCardStatesDidUpdate({ ...this.latestCardStates });
    }
  }
}

interface CardStateSubscriber {
  query: MetabookCardStateQuery;
  onCardStatesDidUpdate: (newCardStates: MetabookCardStateSnapshot) => void;
  onError: (error: Error) => void;
}
