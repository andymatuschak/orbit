import { ActionLog } from "metabook-core";
import { ServerTimestamp } from "./libraryAbstraction";

export type ActionLogDocument<T extends ServerTimestamp> = ActionLog & {
  serverTimestamp: ServerTimestamp;
  suppressTaskStateCacheUpdate?: boolean;
};
