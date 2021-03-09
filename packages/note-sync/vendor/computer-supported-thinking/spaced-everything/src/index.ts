export * as notePrompts from "./taskCache/notePrompts";
export * as ankiCache from "./taskCache/anki";
export * as taskCache from "./taskCache/taskCache";
export * from "./taskCache/taskSource";

import { createDefaultLocalAnkiConnectClient } from "./taskCache/anki/ankiConnect/ankiConnectClient";
export const ankiClient = {
  createDefaultLocalAnkiConnectClient,
};
