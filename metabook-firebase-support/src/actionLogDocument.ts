import { ActionLog } from "metabook-core";
import { Timestamp } from "./libraryAbstraction";

export type ActionLogDocument<T extends Timestamp> = ActionLog & {
  serverTimestamp: Timestamp;
  suppressTaskStateCacheUpdate?: boolean;
};
