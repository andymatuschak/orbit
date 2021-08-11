import { Task } from "@withorbit/core2";
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
  // Less than ideal: here AttachmentIDs are keys of a plain old object, but we can't express that in the type (TypeScript will only allow strings and numbers to be keys of indexed types). Normally we'd deal with this by using a Map, but this structure needs to be serialized to/from JSON.
  attachmentIDsToURLs: { [AttachmentID: string]: string };
}

// Messages from embedded to host:
//================================

export enum EmbeddedScreenEventType {
  TaskUpdate = "taskUpdate",
}

export interface EmbeddedScreenTaskUpdateEvent {
  type: typeof EmbeddedScreenEventType.TaskUpdate;
  task: Task;
}
