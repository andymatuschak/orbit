import { Attachment, AttachmentID, Prompt, PromptID } from "@withorbit/core";

export type DataRecord = Prompt | Attachment;
export type DataRecordID<R extends DataRecord> = R extends Prompt
  ? PromptID
  : R extends Attachment
  ? AttachmentID
  : never;
