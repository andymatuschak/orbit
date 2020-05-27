import { PromptState, PromptTaskID } from "metabook-core";

export interface PromptStateCache extends PromptState {
  taskID: PromptTaskID;
}
