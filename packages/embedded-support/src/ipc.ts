import { ReviewItem, Task } from "@withorbit/core";
import { EmbeddedScreenConfiguration } from "./index.js";

// Messages from host to embedded:
//================================

export enum EmbeddedHostEventType {
  InitialConfiguration = "initialConfiguration",
  HostUpdate = "hostUpdate",
}

export interface EmbeddedHostInitialConfigurationEvent {
  type: typeof EmbeddedHostEventType.InitialConfiguration;
  configuration: EmbeddedScreenConfiguration;
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
  OnLoad = "onLoad",
  TaskUpdate = "taskUpdate",
}

export interface EmbeddedScreenOnLoadEvent {
  type: typeof EmbeddedScreenEventType.OnLoad;
}

export interface EmbeddedScreenTaskUpdateEvent {
  type: typeof EmbeddedScreenEventType.TaskUpdate;
  task: Task;
}
