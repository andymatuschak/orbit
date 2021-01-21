import { PromptState, PromptTaskID } from "metabook-core";
import { ReviewItem } from "./reviewItem";

// Messages from host to embedded:
//================================

export enum EmbeddedHostEventType {
  HostUpdate = "hostUpdate",
}

export interface EmbeddedHostUpdateEvent {
  type: typeof EmbeddedHostEventType.HostUpdate;
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
//================================

export enum EmbeddedScreenEventType {
  ScreenRecordResolved = "screenRecordResolved",
  PromptStateUpdate = "promptStateUpdate",
}

// This message is sent to the host when the embedded screen resolves all its review items.
export interface EmbeddedScreenRecordResolvedEvent {
  type: typeof EmbeddedScreenEventType.ScreenRecordResolved;
  record: EmbeddedScreenRecord;
}

export interface EmbeddedScreenPromptStateUpdateEvent {
  type: typeof EmbeddedScreenEventType.PromptStateUpdate;
  promptTaskID: PromptTaskID;
  promptState: PromptState;
}
