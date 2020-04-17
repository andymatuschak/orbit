import { PromptState } from "metabook-core";
import { Timestamp } from "./libraryAbstraction";

export interface PromptStateCache<T extends Timestamp> extends PromptState {
  taskID: string;
  lastLogServerTimestamp: T;
}
