import { PromptID, PromptState } from "metabook-core";

// Messages from host to embedded:
export const embeddedHostUpdateEventName = "hostUpdate";

export interface EmbeddedHostUpdateEvent {
  type: typeof embeddedHostUpdateEventName;
  state: EmbeddedHostState;
}

export interface EmbeddedHostState {
  orderedScreenStates: (EmbeddedScreenState | null)[];
  receiverIndex: number;
}

// Messages from embedded to host:

export const embeddedScreenStateUpdateEventName = "screenStateUpdate";

export interface EmbeddedScreenUpdateEvent {
  type: typeof embeddedScreenStateUpdateEventName;
  state: EmbeddedScreenState;
}

export interface EmbeddedScreenState {
  orderedPromptIDs: PromptID[];
  orderedPromptStates: (PromptState | null)[];
}
