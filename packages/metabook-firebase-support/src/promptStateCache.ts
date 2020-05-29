import { PromptState, PromptTaskID } from "metabook-core";
import { ServerTimestamp } from "./libraryAbstraction";

export interface PromptStateCache extends PromptState {
  taskID: PromptTaskID;
  latestLogServerTimestamp: ServerTimestamp;
}
