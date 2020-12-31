import { PromptState, PromptTaskID } from "metabook-core";
import { ReviewItem } from "metabook-ui";

// Messages from host to embedded:
export const embeddedHostUpdateEventName = "hostUpdate";
export interface EmbeddedHostUpdateEvent {
  type: typeof embeddedHostUpdateEventName;
  state: EmbeddedHostState;
}

export interface EmbeddedHostState {
  orderedScreenRecords: (EmbeddedScreenRecord | null)[];
  receiverIndex: number;
}

export interface EmbeddedScreenRecord {
  reviewItems: ReviewItem[];
}

// Messages from embedded to host:

// This message is sent to the host when the embedded screen resolves all its review items.
export const embeddedScreenRecordUpdateEventName = "screenRecordUpdate";
export interface EmbeddedScreenRecordUpdateEvent {
  type: typeof embeddedScreenRecordUpdateEventName;
  record: EmbeddedScreenRecord;
}
