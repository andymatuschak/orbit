export { MetabookFirebaseUserClient } from "./userClient";
export type {
  MetabookUserClient,
  MetabookPromptStateSnapshot,
  ActionLogQuery,
  PromptStateQuery,
} from "./userClient";

export { MetabookFirebaseDataClient } from "./dataClient";
export type { MetabookDataClient, MetabookDataSnapshot } from "./dataClient";
export type { default as AttachmentUploader } from "./dataClient/attachmentUploader";
export { default as firebaseAttachmentUploader } from "./dataClient/firebaseAttachmentUploader";

export * as Authentication from "./authentication";

export { getDefaultFirebaseApp } from "./firebase";
