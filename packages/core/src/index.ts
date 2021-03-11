export type { PromptState } from "./promptState";

export * from "./promptState";

export {
  qaPromptType,
  applicationPromptType,
  clozePromptType,
  createClozeMarkupRegexp,
  getClozeDeletionCount,
} from "./types/prompt";

export type {
  Prompt,
  PromptType,
  QAPrompt,
  ApplicationPrompt,
  ClozePrompt,
  QAPromptContents,
  PromptField,
} from "./types/prompt";

export type { MetabookSpacedRepetitionSchedule } from "./spacedRepetition";
export {
  PromptRepetitionOutcome,
  getIntervalSequenceForSchedule,
  getInitialIntervalForSchedule,
  getNextRepetitionInterval,
  promptTypeSupportsRetry,
} from "./spacedRepetition";

export { getIDForPrompt, getIDForPromptSync } from "./promptID";
export type { PromptID } from "./promptID";

export { getIDForPromptTask, getPromptTaskForID } from "./types/promptTask";
export type {
  PromptTask,
  QAPromptTask,
  ApplicationPromptTask,
  ClozePromptTask,
  PromptTaskID,
  PromptParameters,
  ClozePromptParameters,
  PromptTaskParameters,
  ApplicationPromptTaskParameters,
  PromptTaskParametersOf,
  PromptParametersOf,
  PromptOf,
} from "./types/promptTask";

export type { Attachment } from "./types/attachment";
export {
  AttachmentMimeType,
  getAttachmentIDsInPrompt,
  getAttachmentTypeForAttachmentMimeType,
  getAttachmentMimeTypeForFilename,
  getAttachmentMimeTypeFromResourceMetadata,
  getFileExtensionForAttachmentMimeType,
} from "./types/attachment";

export { getIDForAttachment } from "./types/attachmentID";
export type { AttachmentID } from "./types/attachmentID";
export type { AttachmentIDReference } from "./types/attachmentIDReference";
export type { AttachmentType } from "./types/attachmentType";
export { imageAttachmentType } from "./types/attachmentType";
export type {
  AttachmentURLReference,
  AttachmentResolutionMap,
} from "./types/attachmentURLReference";

export { default as getNextTaskParameters } from "./getNextTaskParameters";

export {
  ingestActionLogType,
  repetitionActionLogType,
  updateMetadataActionLogType,
  rescheduleActionLogType,
} from "./types/actionLog";
export type {
  ActionLog,
  ActionLogType,
  IngestActionLog,
  RepetitionActionLog,
  RescheduleActionLog,
} from "./types/actionLog";

export type {
  PromptRepetitionActionLog,
  PromptActionLog,
  PromptIngestActionLog,
  PromptRescheduleActionLog,
  PromptUpdateMetadataActionLog,
} from "./types/promptActionLog";
export {
  getActionLogFromPromptActionLog,
  getPromptActionLogFromActionLog,
} from "./types/promptActionLog";

export { getIDForActionLog, getIDForActionLogSync } from "./actionLogID";
export type { ActionLogID } from "./actionLogID";

export type {
  PromptProvenance,
  AnkiPromptProvenance,
  NotePromptProvenance,
  WebPromptProvenance,
} from "./types/promptProvenance";
export { PromptProvenanceType } from "./types/promptProvenance";

export { default as typedKeys } from "./util/typedKeys";

export type { ColorPaletteName } from "./types/colorPaletteName";

export * as reviewSession from "./reviewSession";
