export { MetabookFirebaseUserClient } from "./userClient";
export type {
  MetabookUserClient,
  MetabookPromptStateSnapshot,
} from "./userClient";

export { MetabookFirebaseDataClient } from "./dataClient";
export type { MetabookDataClient, MetabookDataSnapshot } from "./dataClient";

export * as Authentication from "./authentication";

export { getDefaultFirebaseApp } from "./firebase";
